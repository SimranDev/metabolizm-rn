/**
 * Display layer for the weight feature. Everything the API returns is in
 * kilograms; conversion to the user's unit happens HERE, once, at the edge —
 * never per-point inside a render loop, and never on the server (rounding in
 * both places drifts the chart away from the history list).
 *
 * Pure types live in `@metabolizm/shared`.
 */

import type {
  WeightMilestone,
  WeightSeriesPoint,
  WeightUnit,
} from "@metabolizm/shared";

import { fromKg, kgToLb, kgToStLb } from "@/lib/health";

export const WEIGHT_UNIT_OPTIONS = [
  { value: "kg", label: "kg" },
  { value: "lb", label: "lb" },
  { value: "st", label: "st" },
] as const satisfies readonly { value: WeightUnit; label: string }[];

export const RANGE_OPTIONS = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "1Y", label: "1Y" },
  { value: "ALL", label: "All" },
] as const;

/** A weight in the display unit, without the unit suffix. */
export function formatWeightValue(kg: number, unit: WeightUnit): string {
  if (unit === "st") {
    const { st, lb } = kgToStLb(kg);
    return `${st}′${lb}`;
  }
  return fromKg(kg, unit).toFixed(1);
}

/** A weight with its unit, e.g. "72.1 kg" or "11′4 st". */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${formatWeightValue(kg, unit)} ${unit}`;
}

/**
 * A signed difference. Stone is deliberately rendered in pounds — fractional
 * stone ("0.03 st") is unreadable at the sizes deltas appear in.
 */
export function formatDelta(deltaKg: number, unit: WeightUnit): string {
  const magnitude = Math.abs(deltaKg);
  if (unit === "st") return `${kgToLb(magnitude).toFixed(1)} lb`;
  return `${fromKg(magnitude, unit).toFixed(1)} ${unit}`;
}

/** ▼ / ▲ / — for a signed change. Losing is not assumed to be "good". */
export function trendArrow(delta: number | null): string {
  if (delta === null || Math.abs(delta) < 0.05) return "—";
  return delta < 0 ? "▼" : "▲";
}

/** "▼ 0.4 / wk", or null when there isn't enough data to claim a trend. */
export function formatTrend(
  trendKgPerWeek: number | null,
  unit: WeightUnit,
): string | null {
  if (trendKgPerWeek === null) return null;
  if (Math.abs(trendKgPerWeek) < 0.05) return "holding steady";
  return `${trendArrow(trendKgPerWeek)} ${formatDelta(trendKgPerWeek, unit)} / wk`;
}

/** "Sep 12" — the short form used in "on pace for". */
export function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** "Sunday · 9:20 am" for a history row. */
export function formatLoggedAt(iso: string): string {
  const at = new Date(iso);
  return `${at.toLocaleDateString(undefined, { weekday: "long" })} · ${at
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    .toLowerCase()}`;
}

export function milestoneLabel(
  milestone: WeightMilestone,
  unit: WeightUnit,
): string {
  switch (milestone.kind) {
    case "threshold":
      return `Crossed under ${formatWeight(milestone.valueKg, unit)}`;
    case "all-time-low":
      return `New low — ${formatWeight(milestone.valueKg, unit)}`;
    case "goal-reached":
      return `Goal reached — ${formatWeight(milestone.valueKg, unit)}`;
  }
}

/**
 * Rotating caption under the hero number, keyed on the trend so it can never
 * congratulate someone for a gain they didn't want. Deterministic by design:
 * a table, seeded by the date so it changes daily but not on every re-render,
 * and no model anywhere near it.
 */
const CAPTIONS = {
  down: [
    "Gravity has slightly less to work with now.",
    "The scale is quietly on your side this week.",
    "Small numbers, going the way you asked them to.",
    "Consistency is doing its unglamorous work.",
  ],
  up: [
    "Up a little — bodies do that. The trend is the story.",
    "One week is weather, not climate.",
    "Water, salt, and timing all get a vote here.",
    "Worth watching, not worth worrying about yet.",
  ],
  flat: [
    "Holding steady. Maintenance is a skill too.",
    "The line is flat, which is exactly some people's goal.",
    "Nothing dramatic. That's often the point.",
    "Steady as it goes.",
  ],
  none: [
    "Log a few more days and the trend will show up.",
    "One weigh-in is a dot. A few make a line.",
    "Give it a week — patterns need room to appear.",
  ],
} as const;

export function trendCaption(
  trendKgPerWeek: number | null,
  today = new Date(),
): string {
  const bucket =
    trendKgPerWeek === null
      ? "none"
      : Math.abs(trendKgPerWeek) < 0.05
        ? "flat"
        : trendKgPerWeek < 0
          ? "down"
          : "up";
  const options = CAPTIONS[bucket];
  // Day-of-year seed: stable within a day, so it doesn't flicker on re-render.
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return options[dayOfYear % options.length];
}

/** Local YYYY-MM-DD, matching the diary store's day key. */
export function localDateKey(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Converts a kg series into display units once. Memoize the call on
 * [range, unit, points] — never map inside the render body.
 */
export function toDisplaySeries(
  points: WeightSeriesPoint[],
  unit: WeightUnit,
): { d: string; v: number }[] {
  return points.map((p) => ({ d: p.d, v: fromKg(p.kg, unit) }));
}
