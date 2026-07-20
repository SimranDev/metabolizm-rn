import { users, userWeightGoals, weightEntries } from "@metabolizm/db";
import type {
  WeightEntryDto,
  WeightGoalDto,
  WeightUnit,
} from "@metabolizm/shared";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { isPgError } from "../common/pg-error";
import { DB, type Database } from "../db/db.module";
import { addDays, localDateFor } from "../groups/dates";
import { SummariesService } from "../summaries/summaries.service";
import { isPlausibleKg, toKg, WEIGHT_MAX_KG, WEIGHT_MIN_KG } from "./compute";
import type {
  CreateWeightEntryInput,
  PatchWeightEntryInput,
  PutWeightGoalInput,
} from "./weight.schemas";

type WeightRow = typeof weightEntries.$inferSelect;
type GoalRow = typeof userWeightGoals.$inferSelect;

// Bumped in SQL rather than read-modify-write, so two concurrent writes can't
// land on the same version.
const bumpVersion = sql`${weightEntries.version} + 1`;

export function toWeightEntryDto(row: WeightRow): WeightEntryDto {
  return {
    id: row.id,
    entryDate: row.entryDate,
    weightKg: row.weightKg,
    loggedAt: row.loggedAt.toISOString(),
    note: row.note,
    source: row.source,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

export function toWeightGoalDto(row: GoalRow): WeightGoalDto {
  return {
    id: row.id,
    effectiveFrom: row.effectiveFrom,
    targetWeightKg: row.targetWeightKg,
    startingWeightKg: row.startingWeightKg,
    targetDate: row.targetDate,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Resolves either input form to kilograms and enforces the plausibility bound.
 *
 * The bound is applied HERE, to the converted and rounded value — not in the
 * zod schema. 44.1 lb is 20.0035 kg, which rounds to exactly 20.00 and trips
 * the DB's exclusive `> 20`; validating the raw input would let that reach
 * Postgres as a 23514 and surface to the client as a 500.
 */
function resolveKg(
  input: { weightKg?: number; weight?: number; unit?: WeightUnit },
  field = "weight",
): number {
  const kg =
    input.weightKg !== undefined
      ? toKg(input.weightKg, "kg")
      : toKg(input.weight as number, input.unit as WeightUnit);

  if (!isPlausibleKg(kg)) {
    throw new BadRequestException(
      `That ${field} doesn't look right — expected between ${WEIGHT_MIN_KG} and ${WEIGHT_MAX_KG} kg. Check the unit.`,
    );
  }
  return kg;
}

@Injectable()
export class WeightService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly summaries: SummariesService,
  ) {}

  private async timezoneOf(userId: string): Promise<string> {
    const [row] = await this.db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId));
    return row?.timezone ?? "UTC";
  }

  /**
   * Logs a weigh-in. `id` is client-supplied UUIDv7 so a queued offline log
   * that gets retried is an idempotent upsert rather than a duplicate row.
   */
  async create(
    userId: string,
    input: CreateWeightEntryInput,
  ): Promise<WeightEntryDto> {
    const weightKg = resolveKg(input);
    // entry_date comes from the client, like diary_entries — the device knows
    // its own calendar day, and deriving it from logged_at server-side is the
    // classic bug that files a 23:30 weigh-in under tomorrow.
    const today = localDateFor(await this.timezoneOf(userId));
    if (input.entryDate > addDays(today, 1)) {
      throw new BadRequestException("entryDate is too far in the future");
    }

    return this.db.transaction(async (tx) => {
      const now = new Date();
      const snapshot = {
        entryDate: input.entryDate,
        weightKg,
        loggedAt: new Date(input.loggedAt),
        note: input.note ?? null,
        source: input.source,
      };
      const [row] = await tx
        .insert(weightEntries)
        .values({ id: input.id ?? uuidv7(), userId, ...snapshot, updatedAt: now })
        .onConflictDoUpdate({
          target: weightEntries.id,
          set: { ...snapshot, updatedAt: now, version: bumpVersion },
        })
        .returning();

      await this.summaries.recomputeDayWeight(tx, userId, row.entryDate);
      return toWeightEntryDto(row);
    });
  }

  /**
   * Edits weight, note, or when it was logged. A patch against a tombstone
   * 404s rather than resurrecting it — unlike the diary upsert, which clears
   * deletedAt by design for its offline outbox. Undeleting here would silently
   * hand the day's cached weight back to a row the user thought was gone.
   */
  async patch(
    userId: string,
    id: string,
    input: PatchWeightEntryInput,
  ): Promise<WeightEntryDto> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(weightEntries)
        .where(
          and(
            eq(weightEntries.id, id),
            eq(weightEntries.userId, userId),
            isNull(weightEntries.deletedAt),
          ),
        );
      // Scoped by userId so a probe for someone else's id is indistinguishable
      // from a miss.
      if (!existing) throw new NotFoundException("Entry not found");

      const patch: Partial<typeof weightEntries.$inferInsert> = {};
      if (input.weightKg !== undefined || input.weight !== undefined) {
        patch.weightKg = resolveKg(input);
      }
      if (input.entryDate !== undefined) patch.entryDate = input.entryDate;
      if (input.loggedAt !== undefined) patch.loggedAt = new Date(input.loggedAt);
      if (input.note !== undefined) patch.note = input.note;

      const [row] = await tx
        .update(weightEntries)
        .set({ ...patch, updatedAt: new Date(), version: bumpVersion })
        .where(eq(weightEntries.id, id))
        .returning();

      // A patch can move an entry across days, so the day it LEFT has to be
      // recomputed too — otherwise it keeps caching a weight that moved.
      await this.summaries.recomputeDaysWeight(tx, userId, [
        existing.entryDate,
        row.entryDate,
      ]);
      return toWeightEntryDto(row);
    });
  }

  /** Idempotent soft delete; deleting an already-deleted entry is a no-op. */
  async remove(userId: string, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [tombstoned] = await tx
        .update(weightEntries)
        .set({ deletedAt: new Date(), updatedAt: new Date(), version: bumpVersion })
        .where(
          and(
            eq(weightEntries.id, id),
            eq(weightEntries.userId, userId),
            isNull(weightEntries.deletedAt),
          ),
        )
        .returning();

      if (tombstoned) {
        await this.summaries.recomputeDayWeight(tx, userId, tombstoned.entryDate);
      }
    });
  }

  /**
   * Sets a goal by INSERTING a new versioned row (mirroring user_targets); the
   * previous one stays, so days already lived keep the anchor they were scored
   * against. startingWeightKg is snapshotted now and never recomputed on read
   * — deriving it from "the first entry ever" would shift every past progress
   * percentage the moment someone backfilled an old weigh-in.
   */
  async putGoal(
    userId: string,
    input: PutWeightGoalInput,
  ): Promise<WeightGoalDto> {
    const targetWeightKg = resolveKg(
      {
        weightKg: input.targetWeightKg,
        weight: input.targetWeight,
        unit: input.unit,
      },
      "goal weight",
    );

    const effectiveFrom =
      input.effectiveFrom ?? localDateFor(await this.timezoneOf(userId));

    let startingWeightKg = input.startingWeightKg;
    if (startingWeightKg === undefined) {
      const [latest] = await this.db
        .select({ weightKg: weightEntries.weightKg })
        .from(weightEntries)
        .where(
          and(
            eq(weightEntries.userId, userId),
            isNull(weightEntries.deletedAt),
            lte(weightEntries.entryDate, effectiveFrom),
          ),
        )
        .orderBy(desc(weightEntries.entryDate), desc(weightEntries.loggedAt))
        .limit(1);

      if (!latest) {
        throw new BadRequestException(
          "Log a weight first, or send startingWeightKg with the goal.",
        );
      }
      startingWeightKg = latest.weightKg;
    } else {
      startingWeightKg = resolveKg(
        { weightKg: startingWeightKg },
        "starting weight",
      );
    }

    try {
      const [row] = await this.db
        .insert(userWeightGoals)
        .values({
          id: uuidv7(),
          userId,
          effectiveFrom,
          targetWeightKg,
          startingWeightKg,
          targetDate: input.targetDate ?? null,
        })
        .returning();
      return toWeightGoalDto(row);
    } catch (error) {
      // Backstop for the CHECK constraint — resolveKg should have caught it.
      if (isPgError(error, "23514")) {
        throw new BadRequestException("That goal weight doesn't look right.");
      }
      throw error;
    }
  }
}

