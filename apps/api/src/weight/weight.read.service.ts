import { users, userWeightGoals, weightEntries } from "@metabolizm/db";
import type {
  WeightEntriesResponse,
  WeightGoalDto,
  WeightSeriesPoint,
  WeightSeriesResponse,
  WeightSummaryResponse,
  WeightUnit,
} from "@metabolizm/shared";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import { DB, type Database } from "../db/db.module";
import { addDays, localDateFor } from "../groups/dates";
import {
  bucketFor,
  computeMilestones,
  computeWeightStats,
  DAY_WEIGHT_ORDER_ASC,
  rangeWindow,
} from "./compute";
import type { WeightEntriesQuery, WeightSeriesQuery } from "./weight.schemas";
import { toWeightEntryDto, toWeightGoalDto } from "./weight.service";

/**
 * How much daily history the stats are computed from, regardless of the range
 * being charted. Covers the 30-day average with room for the EMA to settle, so
 * a 1W chart still reports a trend fit on enough history to mean something.
 */
const STATS_WINDOW_DAYS = 90;

/** Streak lookback. Longer than any plausible unbroken run. */
const STREAK_LOOKBACK_DAYS = 400;

// Keyset cursor over (logged_at, id) descending — the history list's order.
const cursorSchema = z.object({
  t: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});

type CursorPayload = z.output<typeof cursorSchema>;

function encodeCursor(cursor: CursorPayload): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: string): CursorPayload {
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
  } catch {
    throw new BadRequestException("Invalid cursor");
  }
}

@Injectable()
export class WeightReadService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * One row per day, holding that day's canonical weigh-in. DISTINCT ON does
   * the pick in SQL so a year of multi-entry days never crosses the wire; the
   * ORDER BY direction is driven by DAY_WEIGHT_RULE, and `id` breaks a tie
   * between two entries sharing a logged_at so the pick is deterministic.
   */
  private dailyCte(userId: string, from?: string, to?: string) {
    const dir = DAY_WEIGHT_ORDER_ASC ? asc : desc;
    const filters: SQL[] = [
      eq(weightEntries.userId, userId),
      isNull(weightEntries.deletedAt),
    ];
    if (from !== undefined) filters.push(gte(weightEntries.entryDate, from));
    if (to !== undefined) filters.push(lte(weightEntries.entryDate, to));

    return this.db.$with("daily").as(
      this.db
        .selectDistinctOn([weightEntries.entryDate], {
          d: weightEntries.entryDate,
          kg: weightEntries.weightKg,
        })
        .from(weightEntries)
        .where(and(...filters))
        .orderBy(
          asc(weightEntries.entryDate),
          dir(weightEntries.loggedAt),
          dir(weightEntries.id),
        ),
    );
  }

  private async dailyPoints(
    userId: string,
    from: string,
    to: string,
  ): Promise<WeightSeriesPoint[]> {
    const daily = this.dailyCte(userId, from, to);
    return this.db.with(daily).select().from(daily).orderBy(asc(daily.d));
  }

  /** timezone + display unit; `asOf` is the user's own local today. */
  async contextFor(userId: string): Promise<{ asOf: string; unit: WeightUnit }> {
    const [row] = await this.db
      .select({ timezone: users.timezone, weightUnit: users.weightUnit })
      .from(users)
      .where(eq(users.id, userId));
    return {
      asOf: localDateFor(row?.timezone ?? "UTC"),
      unit: row?.weightUnit ?? "kg",
    };
  }

  async goalAt(userId: string, asOf: string): Promise<WeightGoalDto | null> {
    // Latest effective_from <= asOf, created_at breaking ties — the same
    // "active versioned row" query as user_targets.
    const [row] = await this.db
      .select()
      .from(userWeightGoals)
      .where(
        and(
          eq(userWeightGoals.userId, userId),
          lte(userWeightGoals.effectiveFrom, asOf),
        ),
      )
      .orderBy(desc(userWeightGoals.effectiveFrom), desc(userWeightGoals.createdAt))
      .limit(1);
    return row ? toWeightGoalDto(row) : null;
  }

  /** First/last logged day and the lowest daily value, over all history. */
  private async bounds(userId: string): Promise<{
    firstDate: string | null;
    allTimeLowKg: number | null;
  }> {
    const daily = this.dailyCte(userId);
    const [row] = await this.db
      .with(daily)
      .select({
        firstDate: sql<string | null>`min(${daily.d})::text`,
        // ::float8 is load-bearing: min()/avg() return numeric, postgres-js
        // hands numerics back as STRINGS, and drizzle's mode:"number" mapping
        // applies to columns, not to expressions. Without the cast this is a
        // string that silently concatenates in later arithmetic.
        allTimeLowKg: sql<number | null>`min(${daily.kg})::float8`,
      })
      .from(daily);
    return {
      firstDate: row?.firstDate ?? null,
      allTimeLowKg: row?.allTimeLowKg ?? null,
    };
  }

  private async loggedDates(userId: string, asOf: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ d: weightEntries.entryDate })
      .from(weightEntries)
      .where(
        and(
          eq(weightEntries.userId, userId),
          isNull(weightEntries.deletedAt),
          lte(weightEntries.entryDate, asOf),
          gte(weightEntries.entryDate, addDays(asOf, -STREAK_LOOKBACK_DAYS)),
        ),
      );
    return rows.map((r) => r.d);
  }

  async series(
    userId: string,
    query: WeightSeriesQuery,
  ): Promise<WeightSeriesResponse> {
    const { asOf, unit } = await this.contextFor(userId);
    const { firstDate, allTimeLowKg } = await this.bounds(userId);

    const { from, to } = rangeWindow(query.range, asOf, firstDate);
    const bucket = bucketFor(query.range, from, to);

    const [rangePoints, statsDaily, goal, logged] = await Promise.all([
      this.rangePoints(userId, from, to, bucket),
      // Always daily and always the same 90 days, independent of `range`: the
      // trend must be fit on daily values even when the chart shows weekly
      // means, which carry roughly half the variance and would flatten it.
      this.dailyPoints(userId, addDays(asOf, -(STATS_WINDOW_DAYS - 1)), asOf),
      this.goalAt(userId, asOf),
      this.loggedDates(userId, asOf),
    ]);

    const stats = computeWeightStats({
      daily: statsDaily,
      rangePoints,
      loggedDates: logged,
      allTimeLowKg,
      goal: goal
        ? { targetKg: goal.targetWeightKg, startingKg: goal.startingWeightKg }
        : null,
      asOf,
    });

    // Milestones are derived from the plotted window so they line up with what
    // the chart actually shows, and are never stored — changing a goal or
    // deleting an entry re-derives them instead of leaving a stale trophy.
    const milestones = computeMilestones({
      daily: bucket === "day" ? rangePoints : await this.dailyPoints(userId, from, to),
      startingKg: goal?.startingWeightKg ?? null,
      targetKg: goal?.targetWeightKg ?? null,
      unit,
    });

    return { unit, range: query.range, bucket, points: rangePoints, goal, stats, milestones };
  }

  private async rangePoints(
    userId: string,
    from: string,
    to: string,
    bucket: "day" | "week" | "month",
  ): Promise<WeightSeriesPoint[]> {
    if (bucket === "day") return this.dailyPoints(userId, from, to);

    const daily = this.dailyCte(userId, from, to);
    // `bucket` is chosen by bucketFor(), never taken from the request. The
    // explicit ::text / ::timestamp casts disambiguate date_trunc's three
    // overloads, and ::text on the result keeps the day a YYYY-MM-DD string
    // rather than whatever postgres-js decides a bare `date` should become.
    const bucketExpr = sql<string>`(date_trunc(${bucket}::text, ${daily.d}::timestamp)::date)::text`;

    return this.db
      .with(daily)
      .select({ d: bucketExpr, kg: sql<number>`avg(${daily.kg})::float8` })
      .from(daily)
      // Grouped by ordinal, not by the expression: drizzle renders the same
      // SQL object unqualified in the SELECT list but table-qualified in
      // GROUP BY, and Postgres then can't match the two ("column
      // daily.entry_date must appear in the GROUP BY clause"). The ordinal
      // refers to the output column and is immune to that.
      .groupBy(sql`1`)
      .orderBy(sql`1`);
  }

  /** The Vitals tile: stats and a 30-day sparkline, no plotted range. */
  async summary(userId: string): Promise<WeightSummaryResponse> {
    const { asOf, unit } = await this.contextFor(userId);
    const { allTimeLowKg } = await this.bounds(userId);

    const [statsDaily, goal, logged] = await Promise.all([
      this.dailyPoints(userId, addDays(asOf, -(STATS_WINDOW_DAYS - 1)), asOf),
      this.goalAt(userId, asOf),
      this.loggedDates(userId, asOf),
    ]);

    const sparklineFrom = addDays(asOf, -29);
    const sparkline = statsDaily.filter((p) => p.d >= sparklineFrom);

    return {
      unit,
      goal,
      stats: computeWeightStats({
        daily: statsDaily,
        rangePoints: sparkline,
        loggedDates: logged,
        allTimeLowKg,
        goal: goal
          ? { targetKg: goal.targetWeightKg, startingKg: goal.startingWeightKg }
          : null,
        asOf,
      }),
      sparkline,
    };
  }

  /** Reverse-chronological history, keyset-paginated. Tombstones excluded. */
  async listEntries(
    userId: string,
    query: WeightEntriesQuery,
  ): Promise<WeightEntriesResponse> {
    const filters: SQL[] = [
      eq(weightEntries.userId, userId),
      isNull(weightEntries.deletedAt),
    ];
    if (query.cursor !== undefined) {
      const cursor = decodeCursor(query.cursor);
      // Bound as ISO strings with casts: raw params in a sql fragment skip
      // drizzle's column mapping, and postgres-js won't serialize a Date there.
      filters.push(
        sql`(${weightEntries.loggedAt}, ${weightEntries.id}) < (${cursor.t}::timestamptz, ${cursor.id}::uuid)`,
      );
    }

    const rows = await this.db
      .select()
      .from(weightEntries)
      .where(and(...filters))
      .orderBy(desc(weightEntries.loggedAt), desc(weightEntries.id))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];

    return {
      entries: page.map(toWeightEntryDto),
      nextCursor:
        last && hasMore
          ? encodeCursor({ t: last.loggedAt.toISOString(), id: last.id })
          : null,
      hasMore,
    };
  }
}
