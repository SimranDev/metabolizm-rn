/**
 * How a single day is scored and coloured in the day strip and the calendar.
 *
 * The thresholds come from @metabolizm/shared, the same constants the server
 * scores group adherence with — a day the API calls "on target" must never be
 * a different colour here.
 *
 * The distinction this module exists to protect: `unknown` (the device has no
 * data for that day yet) is NOT `unlogged` (the day is over and nothing was
 * eaten), and neither is a zero. Rendering a day we simply haven't loaded as
 * "0 kcal, light day" would be inventing a number, which is the same promise
 * the groups UI keeps by never rendering a withheld value as a blank.
 */

import { CALORIE_BAND } from "@metabolizm/shared";

import type { ThemeColors } from "@/theme";

/** What we know about a day, from local entries or a server summary. */
export type DayFacts = {
  energyKcal: number;
  targetKcal: number | null;
  /** Distinct meal slots with at least one entry. 0 = the day is empty. */
  mealsLogged: number;
};

export type DayStatus =
  /** Not loaded yet. Render a skeleton — never a value. */
  | "unknown"
  /** Elapsed, and nothing was logged. */
  | "unlogged"
  /** In progress. */
  | "today"
  /** Future, nothing logged yet. */
  | "plan-ahead"
  /** Future, with food already planned in. */
  | "planned"
  /** Logged, but the account had no target that day — nothing to score against. */
  | "logged"
  | "on-target"
  | "over"
  | "light";

export type DayState = {
  status: DayStatus;
  /** 0–1 ring fill (calories against target); null when there is no target. */
  progress: number | null;
};

/**
 * Score one day. `known` says whether the day falls inside a range the device
 * has actually loaded — a missing day inside a loaded range really is empty,
 * a missing day outside one is merely unseen.
 */
export function dayState(args: {
  date: string;
  today: string;
  facts: DayFacts | null;
  known: boolean;
}): DayState {
  const { date, today, facts, known } = args;
  if (facts === null && !known) return { status: "unknown", progress: null };

  const kcal = facts?.energyKcal ?? 0;
  const target = facts?.targetKcal ?? null;
  const logged = (facts?.mealsLogged ?? 0) > 0;
  const progress =
    target === null || target <= 0 ? null : Math.min(kcal / target, 1);

  if (date > today) {
    return { status: logged ? "planned" : "plan-ahead", progress };
  }
  if (date === today) return { status: "today", progress };
  if (!logged) return { status: "unlogged", progress: null };
  if (target === null || target <= 0) return { status: "logged", progress: null };

  const ratio = kcal / target;
  if (ratio > 1 + CALORIE_BAND) return { status: "over", progress };
  if (ratio < 1 - CALORIE_BAND) return { status: "light", progress };
  return { status: "on-target", progress };
}

/**
 * Ring stroke + tinted fill per status.
 *
 * `success`/`danger` are status roles, which is exactly what this is, and
 * `accent` marks the active/in-progress day — both allowed uses. A day with no
 * ring colour returns null and draws the bare track.
 */
export function dayStatusColors(
  colors: ThemeColors,
  status: DayStatus,
): { ring: string | null; fill: string | null; dashed: boolean } {
  switch (status) {
    case "on-target":
      return { ring: colors.success, fill: colors.successSoft, dashed: false };
    case "over":
      return { ring: colors.danger, fill: colors.dangerSoft, dashed: false };
    case "light":
      return { ring: colors.secondary, fill: colors.surfaceSunken, dashed: false };
    case "today":
    case "planned":
      return { ring: colors.accent, fill: null, dashed: false };
    case "logged":
      return { ring: colors.borderStrong, fill: colors.surfaceSunken, dashed: false };
    case "plan-ahead":
      return { ring: null, fill: null, dashed: true };
    case "unlogged":
    case "unknown":
      return { ring: null, fill: null, dashed: false };
  }
}

/** Legend copy for the calendar sheet, in the order the mock lists it. */
export const DAY_STATUS_LEGEND: { status: DayStatus; label: string }[] = [
  { status: "on-target", label: "On target" },
  { status: "over", label: "Over budget" },
  { status: "light", label: "Light day" },
  { status: "plan-ahead", label: "Plan ahead" },
];

/** Spoken description of a day's state, appended to date + calories. */
export function describeDayStatus(status: DayStatus): string {
  switch (status) {
    case "on-target":
      return "on target";
    case "over":
      return "over budget";
    case "light":
      return "light day";
    case "today":
      return "today, in progress";
    case "planned":
      return "planned";
    case "plan-ahead":
      return "nothing planned";
    case "logged":
      return "logged";
    case "unlogged":
      return "not logged";
    case "unknown":
      return "not loaded yet";
  }
}
