import {
  dailySummaries,
  diaryEntries,
  userTargets,
  weightEntries,
} from "@metabolizm/db";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, lte } from "drizzle-orm";

import type { Database } from "../db/db.module";
import { pickDayWeightKg } from "../weight/compute";
import { computeDaySummary } from "./compute";

// A drizzle transaction handle — recompute runs INSIDE the caller's diary
// write transaction so a summary can never go out of sync with its entries.
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbExecutor = Database | Tx;

@Injectable()
export class SummariesService {
  /**
   * Idempotent upsert of the (user, day) daily_summaries row from its diary
   * entries. Targets are snapshotted from the user_targets row effective FOR
   * entry_date (not today's), so recomputing a past day never picks up a
   * later target change. weight_kg is deliberately left untouched — it's
   * owned by a future weight-log write path.
   */
  async recomputeDay(
    db: DbExecutor,
    userId: string,
    entryDate: string,
  ): Promise<void> {
    const entries = await db
      .select({
        meal: diaryEntries.meal,
        name: diaryEntries.name,
        energyKcal: diaryEntries.energyKcal,
        proteinG: diaryEntries.proteinG,
        carbsG: diaryEntries.carbsG,
        fatG: diaryEntries.fatG,
        loggedAt: diaryEntries.loggedAt,
        deletedAt: diaryEntries.deletedAt,
      })
      .from(diaryEntries)
      .where(
        and(
          eq(diaryEntries.userId, userId),
          eq(diaryEntries.entryDate, entryDate),
        ),
      );

    // The target effective FOR this day: latest effective_from <= entry_date
    // (created_at breaks ties). Snapshotting by the day being recomputed —
    // not by today — is what keeps a later target change from rewriting past
    // adherence.
    const [target] = await db
      .select()
      .from(userTargets)
      .where(
        and(
          eq(userTargets.userId, userId),
          lte(userTargets.effectiveFrom, entryDate),
        ),
      )
      .orderBy(desc(userTargets.effectiveFrom), desc(userTargets.createdAt))
      .limit(1);

    const totals = computeDaySummary(entries);
    const snapshot = {
      ...totals,
      targetKcal: target?.energyKcal ?? null,
      targetProteinG: target?.proteinG ?? null,
      targetCarbsG: target?.carbsG ?? null,
      targetFatG: target?.fatG ?? null,
      updatedAt: new Date(),
    };
    await db
      .insert(dailySummaries)
      .values({ userId, entryDate, ...snapshot })
      .onConflictDoUpdate({
        target: [dailySummaries.userId, dailySummaries.entryDate],
        set: snapshot,
      });
  }

  async recomputeDays(
    db: DbExecutor,
    userId: string,
    entryDates: Iterable<string>,
  ): Promise<void> {
    for (const entryDate of new Set(entryDates)) {
      await this.recomputeDay(db, userId, entryDate);
    }
  }

  /**
   * Idempotent refresh of the (user, day) weight cache from weight_entries —
   * the mirror image of recomputeDay. That method owns every nutrition column
   * and never touches weight_kg; this one owns weight_kg and never touches
   * nutrition. The two `set` maps are disjoint, so both writers can share the
   * PK row without clobbering each other. Do not merge them.
   *
   * Notably absent: any target snapshot. A day with only a weigh-in must stay
   * unscorable — snapshotting targets here would make it "0 kcal against a
   * 2000 kcal target", so logging your weight would register as an adherence
   * miss. The nutrition columns' defaults (0 / '[]') keep such a row inert:
   * every group consumer gates on meals_logged > 0 or a non-null target.
   */
  async recomputeDayWeight(
    db: DbExecutor,
    userId: string,
    entryDate: string,
  ): Promise<void> {
    const rows = await db
      .select({
        weightKg: weightEntries.weightKg,
        loggedAt: weightEntries.loggedAt,
        deletedAt: weightEntries.deletedAt,
      })
      .from(weightEntries)
      .where(
        and(
          eq(weightEntries.userId, userId),
          eq(weightEntries.entryDate, entryDate),
        ),
      );

    const weightKg = pickDayWeightKg(rows);
    // JS Date (ms), not now() (µs), so sync cursors round-trip exactly —
    // same reason as the diary write path.
    const updatedAt = new Date();

    if (weightKg === null) {
      // Update, never upsert: creating a row just to hold a null would
      // materialize an all-zero summary for a day the user never logged.
      await db
        .update(dailySummaries)
        .set({ weightKg: null, updatedAt })
        .where(
          and(
            eq(dailySummaries.userId, userId),
            eq(dailySummaries.entryDate, entryDate),
          ),
        );
      return;
    }

    await db
      .insert(dailySummaries)
      .values({ userId, entryDate, weightKg })
      .onConflictDoUpdate({
        target: [dailySummaries.userId, dailySummaries.entryDate],
        set: { weightKg, updatedAt },
      });
  }

  async recomputeDaysWeight(
    db: DbExecutor,
    userId: string,
    entryDates: Iterable<string>,
  ): Promise<void> {
    for (const entryDate of new Set(entryDates)) {
      await this.recomputeDayWeight(db, userId, entryDate);
    }
  }
}
