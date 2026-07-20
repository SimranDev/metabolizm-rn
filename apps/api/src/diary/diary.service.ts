import { diaryEntries } from "@metabolizm/db";
import type { DiaryEntryDto, DiaryEntryUpsert } from "@metabolizm/shared";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";

import { isPgError } from "../common/pg-error";
import { DB, type Database } from "../db/db.module";
import { SummariesService } from "../summaries/summaries.service";
import type { DiaryDaysQuery } from "./diary.schemas";

type DiaryRow = typeof diaryEntries.$inferSelect;

export function toDiaryEntryDto(row: DiaryRow): DiaryEntryDto {
  return {
    id: row.id,
    entryDate: row.entryDate,
    meal: row.meal,
    foodId: row.foodId,
    name: row.name,
    servingLabel: row.servingLabel,
    quantity: row.quantity,
    unitLabel: row.unitLabel,
    unitAmountInBase: row.unitAmountInBase,
    energyKcal: row.energyKcal,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    nutrients: row.nutrients,
    verified: row.verified,
    loggedAt: row.loggedAt.toISOString(),
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

@Injectable()
export class DiaryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly summaries: SummariesService,
  ) {}

  /**
   * Atomic batch upsert: insert or overwrite-by-id, LWW on receipt order.
   * The server bumps `version` and sets `updated_at`; an upsert against a
   * tombstone resurrects it (the later write wins).
   */
  async upsertEntries(
    userId: string,
    entries: DiaryEntryUpsert[],
  ): Promise<DiaryEntryDto[]> {
    const ids = entries.map((e) => e.id);
    try {
      const rows = await this.db.transaction(async (tx) => {
        const owners = await tx
          .select({
            id: diaryEntries.id,
            userId: diaryEntries.userId,
            entryDate: diaryEntries.entryDate,
          })
          .from(diaryEntries)
          .where(inArray(diaryEntries.id, ids));
        if (owners.some((row) => row.userId !== userId)) {
          // Same 404 as a missing entry — never reveal that the id exists.
          throw new NotFoundException("Entry not found");
        }
        // Pre-write dates too: an upsert can move an entry across days, and
        // the day it left must be recomputed as well.
        const affectedDates = new Set<string>(owners.map((r) => r.entryDate));
        const written: DiaryRow[] = [];
        for (const entry of entries) {
          // updated_at is always set here (JS Date, ms precision) instead of
          // being left to now() (µs) so sync cursors built from returned
          // values round-trip exactly through the keyset comparison.
          const now = new Date();
          const snapshot = {
            entryDate: entry.entryDate,
            meal: entry.meal,
            foodId: entry.foodId ?? null,
            name: entry.name,
            servingLabel: entry.servingLabel,
            quantity: entry.quantity ?? null,
            unitLabel: entry.unitLabel ?? null,
            unitAmountInBase: entry.unitAmountInBase ?? null,
            energyKcal: entry.energyKcal,
            proteinG: entry.proteinG,
            carbsG: entry.carbsG,
            fatG: entry.fatG,
            nutrients: entry.nutrients,
            verified: entry.verified,
            loggedAt: new Date(entry.loggedAt),
          };
          const [row] = await tx
            .insert(diaryEntries)
            .values({ id: entry.id, userId, ...snapshot, updatedAt: now })
            .onConflictDoUpdate({
              target: diaryEntries.id,
              set: {
                ...snapshot,
                updatedAt: now,
                version: sql`${diaryEntries.version} + 1`,
                deletedAt: null,
              },
            })
            .returning();
          written.push(row);
          affectedDates.add(row.entryDate);
        }
        await this.summaries.recomputeDays(tx, userId, affectedDates);
        return written;
      });
      return rows.map(toDiaryEntryDto);
    } catch (error) {
      // FK violation: a foodId that doesn't exist in the catalog.
      if (isPgError(error, "23503")) {
        throw new BadRequestException("Unknown foodId");
      }
      throw error;
    }
  }

  /** Active entries for a date range, flat — the client groups by date/meal. */
  async listDays(
    userId: string,
    query: DiaryDaysQuery,
  ): Promise<DiaryEntryDto[]> {
    const rows = await this.db
      .select()
      .from(diaryEntries)
      .where(
        and(
          eq(diaryEntries.userId, userId),
          isNull(diaryEntries.deletedAt),
          gte(diaryEntries.entryDate, query.from),
          lte(diaryEntries.entryDate, query.to),
        ),
      )
      .orderBy(
        asc(diaryEntries.entryDate),
        asc(diaryEntries.loggedAt),
        asc(diaryEntries.id),
      );
    return rows.map(toDiaryEntryDto);
  }

  /**
   * Soft delete. Fully idempotent 204: missing ids, re-deletes, and other
   * users' ids all no-op — the where clause can never touch another user's
   * row, and outbox replays / offline add-then-delete need no special cases.
   */
  async deleteEntry(userId: string, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [tombstoned] = await tx
        .update(diaryEntries)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
          version: sql`${diaryEntries.version} + 1`,
        })
        .where(
          and(
            eq(diaryEntries.id, id),
            eq(diaryEntries.userId, userId),
            isNull(diaryEntries.deletedAt),
          ),
        )
        .returning({ entryDate: diaryEntries.entryDate });
      if (tombstoned) {
        await this.summaries.recomputeDay(tx, userId, tombstoned.entryDate);
      }
    });
  }

  /** Most recent active entry per distinct food (non-null foodId), newest first. */
  async recents(userId: string, limit: number): Promise<DiaryEntryDto[]> {
    const latest = this.db
      .selectDistinctOn([diaryEntries.foodId])
      .from(diaryEntries)
      .where(
        and(
          eq(diaryEntries.userId, userId),
          isNotNull(diaryEntries.foodId),
          isNull(diaryEntries.deletedAt),
        ),
      )
      .orderBy(asc(diaryEntries.foodId), desc(diaryEntries.loggedAt))
      .as("latest");
    const rows = await this.db
      .select()
      .from(latest)
      .orderBy(desc(latest.loggedAt))
      .limit(limit);
    return rows.map(toDiaryEntryDto);
  }
}
