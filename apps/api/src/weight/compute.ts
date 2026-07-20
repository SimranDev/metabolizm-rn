/**
 * All weight math, with no database access — unit-testable in isolation, the
 * same split as summaries/compute.ts. Every date is a YYYY-MM-DD string and
 * every arithmetic on one goes through addDays, which is UTC-anchored: the
 * moment anything here reaches for `new Date().setDate(...)` instead, streaks
 * break twice a year for half the world.
 */

import type {
  WeightBucket,
  WeightMilestone,
  WeightRange,
  WeightSeriesPoint,
  WeightStats,
  WeightUnit,
} from "@metabolizm/shared";

import { computeStreak } from "../groups/adherence";
import { addDays } from "../groups/dates";

// ── The day-weight convention ───────────────────────────────────────────────

/**
 * Which weigh-in owns a day when several exist. Weight swings ~1 kg across a
 * day with food and hydration, so a consistent time-of-day is the only way a
 * day-over-day series means anything; "earliest" encodes the morning weigh-in
 * convention. Flip this one constant and the SQL pick, the daily_summaries
 * cache, and the chart all follow.
 */
export const DAY_WEIGHT_RULE: "earliest" | "latest" = "earliest";

/** The logged_at sort direction the day pick implies. */
export const DAY_WEIGHT_ORDER_ASC = DAY_WEIGHT_RULE === "earliest";

// ── Units ───────────────────────────────────────────────────────────────────

/**
 * The SAME literal as apps/mobile/src/lib/health/units.ts. Deliberately not
 * the reciprocal 2.20462262: a 1e-12 disagreement is invisible except at an
 * exact .xx5 rounding boundary, where the client and server would then display
 * different kilograms for the same pound entry.
 */
export const KG_PER_LB = 0.45359237;
export const LB_PER_STONE = 14;
export const KG_PER_STONE = KG_PER_LB * LB_PER_STONE;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A value entered in `unit`, as kilograms rounded to the column's scale. */
export function toKg(value: number, unit: WeightUnit): number {
  if (unit === "kg") return round2(value);
  if (unit === "lb") return round2(value * KG_PER_LB);
  return round2(value * KG_PER_STONE);
}

export function fromKg(kg: number, unit: WeightUnit): number {
  if (unit === "kg") return kg;
  if (unit === "lb") return kg / KG_PER_LB;
  return kg / KG_PER_STONE;
}

// ── Plausibility ────────────────────────────────────────────────────────────

/** Mirrors the weight_entries CHECK constraint; both bounds are exclusive. */
export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 500;

/**
 * Must be called on the CONVERTED, ROUNDED kilogram value. Checking the raw
 * input instead lets 44.1 lb through as 20.0035 kg, which rounds to exactly
 * 20.00 and then 23514s in Postgres as a 500 instead of a 400.
 */
export function isPlausibleKg(kg: number): boolean {
  return Number.isFinite(kg) && kg > WEIGHT_MIN_KG && kg < WEIGHT_MAX_KG;
}

// ── The day pick ────────────────────────────────────────────────────────────

export type DayWeightInput = {
  weightKg: number;
  loggedAt: Date;
  deletedAt: Date | null;
};

/**
 * The day's canonical weight per DAY_WEIGHT_RULE, or null when every entry for
 * the day is tombstoned. Deleting the earliest entry therefore promotes the
 * next one — a real, visible rewrite of that day's history, which is why the
 * UI labels the value "morning weigh-in" rather than "your weight".
 */
export function pickDayWeightKg(entries: DayWeightInput[]): number | null {
  const active = entries.filter((e) => e.deletedAt === null);
  if (active.length === 0) return null;

  let best = active[0];
  for (const entry of active.slice(1)) {
    const t = entry.loggedAt.getTime();
    const bestT = best.loggedAt.getTime();
    if (DAY_WEIGHT_ORDER_ASC ? t < bestT : t > bestT) best = entry;
  }
  return best.weightKg;
}

// ── Series windowing ────────────────────────────────────────────────────────

/** Payload cap. Every range/bucket pairing below stays under this. */
export const MAX_SERIES_POINTS = 200;

export const RANGE_DAYS: Record<Exclude<WeightRange, "ALL">, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "1Y": 365,
};

/** Above this span, ALL switches from weekly to monthly buckets. */
export const ALL_WEEKLY_MAX_DAYS = 730;

/** Inclusive date window for a range, clamped to the first entry for ALL. */
export function rangeWindow(
  range: WeightRange,
  today: string,
  firstEntryDate: string | null,
): { from: string; to: string } {
  if (range === "ALL") {
    return { from: firstEntryDate ?? today, to: today };
  }
  return { from: addDays(today, -(RANGE_DAYS[range] - 1)), to: today };
}

const daySpan = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;

export function bucketFor(
  range: WeightRange,
  from: string,
  to: string,
): WeightBucket {
  if (range === "1W" || range === "1M" || range === "3M") return "day";
  if (range === "1Y") return "week";
  return daySpan(from, to) < ALL_WEEKLY_MAX_DAYS ? "week" : "month";
}

// ── EMA and trend ───────────────────────────────────────────────────────────

export const EMA_ALPHA = 0.1;
export const TREND_WINDOW_DAYS = 14;
export const TREND_MIN_POINTS = 4;

/**
 * Exponential moving average over the daily series, seeded with the first
 * point. Raw daily weight carries about a kilogram of water noise, which makes
 * a naive slope — and the projected date built on it — jump around day to day;
 * smoothing first is what makes the trend stable enough to show.
 *
 * The alpha is applied PER ELAPSED DAY, not per sample: `1 - (1 - a)^gap`.
 * People skip weigh-ins for weeks, and a per-sample alpha treats the point
 * after a month-long gap as if it were the next morning — so a steep decline
 * from before the gap keeps bleeding into today's trend. Concretely, a user
 * who dropped fast in May, stopped logging, and has been flat all July would
 * be told they're still losing 1.7 kg/week. Over a 38-day gap the weight on
 * the stale value falls to 0.9^38 ≈ 0.02, which is the intended behaviour: an
 * old reading stops being evidence about today.
 *
 * Caveat that remains: with alpha 0.1 the seed takes roughly 20 daily points
 * to wash out, so a user five days into logging gets an EMA still biased
 * toward their first weigh-in.
 */
export function emaSeries(daily: WeightSeriesPoint[]): WeightSeriesPoint[] {
  if (daily.length === 0) return [];
  let ema = daily[0].kg;
  return daily.map((p, i) => {
    if (i > 0) {
      const gapDays = Math.max(
        1,
        Math.round(
          (Date.parse(`${p.d}T00:00:00Z`) -
            Date.parse(`${daily[i - 1].d}T00:00:00Z`)) /
            86_400_000,
        ),
      );
      const alpha = 1 - (1 - EMA_ALPHA) ** gapDays;
      ema = alpha * p.kg + (1 - alpha) * ema;
    }
    return { d: p.d, kg: ema };
  });
}

/**
 * Least-squares slope over the last TREND_WINDOW_DAYS of the EMA, in kg/week.
 * Null when too few points fall in the window to mean anything, or when they
 * all share one date (a zero-variance x, which would divide by zero).
 */
export function trendKgPerWeek(
  ema: WeightSeriesPoint[],
  asOf: string,
): number | null {
  const from = addDays(asOf, -(TREND_WINDOW_DAYS - 1));
  const window = ema.filter((p) => p.d >= from && p.d <= asOf);
  if (window.length < TREND_MIN_POINTS) return null;

  const base = Date.parse(`${window[0].d}T00:00:00Z`);
  const xs = window.map(
    (p) => (Date.parse(`${p.d}T00:00:00Z`) - base) / 86_400_000,
  );
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = window.reduce((a, p) => a + p.kg, 0) / window.length;

  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i] - meanX) * (window[i].kg - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;

  return round2((num / den) * 7);
}

// ── Projection, progress, averages, streak ──────────────────────────────────

/** Below this the trend is indistinguishable from noise. */
export const PROJECTION_MIN_ABS_TREND = 0.05;
export const PROJECTION_MAX_WEEKS = 104;

/**
 * When the current trend would reach the goal. Null in every case where the
 * answer would be invented — no trend, a trend flatter than noise, a trend
 * moving away from the goal, or a date beyond two years. Showing a fabricated
 * date is worse than showing none.
 */
export function projectGoalDate(args: {
  currentEmaKg: number | null;
  targetKg: number | null;
  trendKgPerWeek: number | null;
  asOf: string;
}): string | null {
  const { currentEmaKg, targetKg, trendKgPerWeek: trend, asOf } = args;
  if (currentEmaKg === null || targetKg === null || trend === null) return null;
  if (Math.abs(trend) < PROJECTION_MIN_ABS_TREND) return null;

  const remaining = targetKg - currentEmaKg;
  // Same sign means the trend moves toward the goal; opposite means away.
  if (remaining === 0) return asOf;
  if (Math.sign(remaining) !== Math.sign(trend)) return null;

  const weeks = remaining / trend;
  if (weeks > PROJECTION_MAX_WEEKS) return null;

  return addDays(asOf, Math.ceil(weeks * 7));
}

/**
 * How far along the journey, 0–100. The same formula covers weight gain:
 * both differences flip sign and the ratio survives. Null when start equals
 * target, where the question has no answer.
 */
export function progressPct(
  startingKg: number,
  currentKg: number,
  targetKg: number,
): number | null {
  const span = startingKg - targetKg;
  if (span === 0) return null;
  const pct = ((startingKg - currentKg) / span) * 100;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

/** Mean of the daily points inside the trailing window ending at asOf. */
export function trailingAvgKg(
  daily: WeightSeriesPoint[],
  asOf: string,
  days: number,
): number | null {
  const from = addDays(asOf, -(days - 1));
  const window = daily.filter((p) => p.d >= from && p.d <= asOf);
  if (window.length === 0) return null;
  return round2(window.reduce((a, p) => a + p.kg, 0) / window.length);
}

/**
 * Consecutive days with at least one weigh-in. Today not being logged yet
 * doesn't break the streak — it only breaks once a day has ended empty.
 */
export function weightStreakDays(
  loggedDates: Iterable<string>,
  today: string,
): number {
  return computeStreak(new Set(loggedDates), today);
}

// ── Assembly ────────────────────────────────────────────────────────────────

export type WeightStatsInput = {
  /** Daily points across the stats window, ascending. Never bucketed. */
  daily: WeightSeriesPoint[];
  /** The points actually returned — may be weekly/monthly. */
  rangePoints: WeightSeriesPoint[];
  loggedDates: string[];
  allTimeLowKg: number | null;
  goal: { targetKg: number; startingKg: number } | null;
  asOf: string;
};

export function computeWeightStats(input: WeightStatsInput): WeightStats {
  const { daily, rangePoints, loggedDates, allTimeLowKg, goal, asOf } = input;

  const currentKg = daily.length > 0 ? daily[daily.length - 1].kg : null;

  // Range change comes from the plotted points so it always matches what the
  // chart shows, even when those points are weekly means.
  const changeKg =
    rangePoints.length >= 2
      ? round2(rangePoints[rangePoints.length - 1].kg - rangePoints[0].kg)
      : null;

  // The trend is fit on DAILY values even when the chart is bucketed: weekly
  // means have roughly half the variance, which would bias the slope.
  const ema = emaSeries(daily);
  const trend = trendKgPerWeek(ema, asOf);
  const currentEmaKg = ema.length > 0 ? ema[ema.length - 1].kg : null;

  return {
    currentKg,
    changeKg,
    avg7Kg: trailingAvgKg(daily, asOf, 7),
    avg30Kg: trailingAvgKg(daily, asOf, 30),
    sinceStartKg:
      goal && currentKg !== null ? round2(currentKg - goal.startingKg) : null,
    progressPct:
      goal && currentKg !== null
        ? progressPct(goal.startingKg, currentKg, goal.targetKg)
        : null,
    trendKgPerWeek: trend,
    projectedGoalDate: projectGoalDate({
      currentEmaKg,
      targetKg: goal?.targetKg ?? null,
      trendKgPerWeek: trend,
      asOf,
    }),
    streakDays: weightStreakDays(loggedDates, asOf),
    allTimeLowKg,
  };
}

// ── Milestones ──────────────────────────────────────────────────────────────

/**
 * Threshold spacing per display unit. 5 stone is nearly 32 kg, which would be
 * one milestone a decade — stone gets a step of 1.
 */
export const MILESTONE_STEP_BY_UNIT: Record<WeightUnit, number> = {
  kg: 5,
  lb: 5,
  st: 1,
};

/** Newest first, capped so a long history can't flood the response. */
export const MILESTONE_LIMIT = 20;

/**
 * How long the previous low must have stood before beating it is worth
 * announcing. During any sustained decline every single day sets a new record,
 * so an unthrottled rule emits one milestone per day, says nothing, and — with
 * MILESTONE_LIMIT applied newest-first — pushes the genuinely rare thresholds
 * and goal-reached off the end of the list entirely. A month is the shortest
 * gap that makes "lightest you've been since March" a real claim.
 */
export const ALL_TIME_LOW_MIN_GAP_DAYS = 30;

/**
 * Computed on read, never stored — so changing a goal or deleting an entry
 * re-derives them rather than leaving a stale trophy behind.
 */
export function computeMilestones(input: {
  daily: WeightSeriesPoint[];
  startingKg: number | null;
  targetKg: number | null;
  unit: WeightUnit;
}): WeightMilestone[] {
  const { daily, startingKg, targetKg, unit } = input;
  if (daily.length === 0) return [];

  const out: WeightMilestone[] = [];
  const step = MILESTONE_STEP_BY_UNIT[unit];

  // Thresholds are counted in the DISPLAY unit so a pound user crosses 200 lb,
  // not 90 kg. This tracks the LOWEST band ever reached and never rises, so a
  // threshold fires exactly once in a lifetime: day-to-day weight wanders a
  // kilogram either side of a boundary, and re-announcing "crossed under 75 kg"
  // every time it wobbles back under turns a real milestone into noise.
  let lowestBand =
    startingKg === null ? null : Math.floor(fromKg(startingKg, unit) / step);
  let low: number | null = null;
  let lowSetOn: string | null = null;
  let goalHit = false;

  for (const point of daily) {
    if (lowestBand !== null) {
      const band = Math.floor(fromKg(point.kg, unit) / step);
      // Every band skipped in one jump still gets its own milestone.
      for (let b = lowestBand - 1; b >= band; b -= 1) {
        out.push({
          kind: "threshold",
          valueKg: round2(toKg((b + 1) * step, unit)),
          date: point.d,
        });
      }
      if (band < lowestBand) lowestBand = band;
    }

    if (low === null || point.kg < low) {
      // The first point isn't an achievement, it's the baseline. After that,
      // only a low that unseats one which has stood a while gets announced —
      // but `low` still tracks every new minimum, so the gap is measured from
      // when the record was actually set.
      const stoodLongEnough =
        lowSetOn !== null &&
        point.d >= addDays(lowSetOn, ALL_TIME_LOW_MIN_GAP_DAYS);
      if (low !== null && stoodLongEnough) {
        out.push({ kind: "all-time-low", valueKg: point.kg, date: point.d });
        lowSetOn = point.d;
      } else if (low === null) {
        lowSetOn = point.d;
      }
      low = point.kg;
    }

    if (!goalHit && targetKg !== null && startingKg !== null) {
      const reached =
        startingKg > targetKg ? point.kg <= targetKg : point.kg >= targetKg;
      if (reached) {
        out.push({ kind: "goal-reached", valueKg: targetKg, date: point.d });
        goalHit = true;
      }
    }
  }

  return out.reverse().slice(0, MILESTONE_LIMIT);
}
