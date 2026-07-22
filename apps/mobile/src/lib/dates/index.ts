/**
 * Calendar-day helpers. Every day in this app is a `YYYY-MM-DD` string, never a
 * `Date`, and all arithmetic here runs on the UTC parse of that string.
 *
 * That is deliberate and load-bearing: the moment anything reaches for
 * `date.setDate(date.getDate() + 1)` on a local Date, the two days a year that
 * are 23 or 25 hours long start silently dropping or duplicating a day, and
 * streaks break for half the world. ISO day strings also compare correctly with
 * `<` / `>` / `===`, which is what the range checks throughout the app rely on.
 *
 * Mirrors apps/api/src/groups/dates.ts, which does the same on the server.
 */

const DAY_MS = 86_400_000;

/**
 * Today (or any Date) as a local `YYYY-MM-DD`.
 *
 * Shifts by the zone offset before slicing the ISO string, so the key is the
 * day the USER is in, not the UTC day — at UTC+13 those differ for 13 hours out
 * of every 24.
 */
export function dayKey(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function addDays(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS,
  );
}

/** Day of week, 0 = Sunday. */
export function weekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** The Sunday of the week containing `day` — the day strip starts there. */
export function startOfWeek(day: string): string {
  return addDays(day, -weekday(day));
}

/** The seven days of `day`'s week, Sunday first. */
export function weekDays(day: string): string[] {
  const start = startOfWeek(day);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/**
 * The first of the month `count` months from `day`'s month. Goes through the
 * y/m integers rather than day arithmetic so month lengths never matter.
 */
export function addMonths(day: string, count: number): string {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const total = year * 12 + (month - 1) + count;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
}

export function daysInMonth(day: string): number {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  // Day 0 of the NEXT month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The month's cells laid out Sunday-first, with `null` for the leading and
 * trailing blanks. Nulls rather than adjacent-month days on purpose: a greyed
 * neighbouring day invites a tap that silently jumps the month.
 */
export function monthGrid(day: string): (string | null)[] {
  const first = startOfMonth(day);
  const lead = weekday(first);
  const length = daysInMonth(day);
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let i = 0; i < length; i++) cells.push(addDays(first, i));
  // Pad to a whole final row so the grid never reflows between months.
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Clamp a day into an inclusive range. */
export function clampDay(day: string, min: string, max: string): string {
  return day < min ? min : day > max ? max : day;
}

// ── Formatting ──────────────────────────────────────────────────────────────
// Parsed as UTC and formatted in UTC, so a day string always renders as the
// day it says regardless of the device's zone.

const asUtc = (day: string) => new Date(`${day}T00:00:00Z`);

const fmt = (day: string, options: Intl.DateTimeFormatOptions) =>
  asUtc(day).toLocaleDateString(undefined, { timeZone: "UTC", ...options });

/** "Wed, Jul 22" */
export const formatShortDate = (day: string) =>
  fmt(day, { weekday: "short", month: "short", day: "numeric" });

/** "Jul 22, 2026" */
export const formatMediumDate = (day: string) =>
  fmt(day, { month: "short", day: "numeric", year: "numeric" });

/** "Wednesday, July 22, 2026" — for accessibility labels. */
export const formatLongDate = (day: string) =>
  fmt(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** "Friday" */
export const formatWeekday = (day: string) => fmt(day, { weekday: "long" });

/** "July 2026" */
export const formatMonth = (day: string) =>
  fmt(day, { month: "long", year: "numeric" });

/** Day of month as a bare number string, e.g. "22". */
export const formatDayOfMonth = (day: string) => String(Number(day.slice(8, 10)));

/** Single-letter weekday initials for the strip/grid headers, Sunday first. */
export const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;
