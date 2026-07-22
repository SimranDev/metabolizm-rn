/**
 * Scores a set of calendar days for the day strip and the calendar grid.
 *
 * This is where the one-directional rule between the two caches is applied:
 * local diary entries win for every day they cover, and a server summary is
 * only consulted for a day the device holds no entries for. The two never
 * arbitrate over the same day, so there is no merge and no "newest wins" — a
 * background summary can't overwrite a food the user logged a second ago.
 *
 * The single exception is the TARGET. A summary row carries the target that was
 * in force for that day, which is the honest number for a past day; the
 * profile's current target is only the fallback. That keeps changing your goal
 * from silently recolouring last month.
 */

import { dayKey } from "@/lib/dates";
import { dayState, type DayState } from "@/lib/diary/day-status";
import { dayTotals, isDateRetained, useDiary } from "@/store/diary";
import { useProfile } from "@/store/profile";
import { isRangeLoaded, useSummaries } from "@/store/summaries";

export function useDayStates(dates: readonly string[]): Map<string, DayState> {
  const entriesByDate = useDiary((s) => s.entriesByDate);
  const lastFullSync = useDiary((s) => s.lastFullSync);
  const summaries = useSummaries((s) => s.byDate);
  const loadedRanges = useSummaries((s) => s.loaded);
  const targetCalories = useProfile((s) => s.profile?.targetCalories ?? null);
  const today = dayKey();

  const states = new Map<string, DayState>();
  for (const date of dates) {
    const local = entriesByDate[date];
    const summary = summaries[date];
    const known =
      local !== undefined ||
      (lastFullSync !== null && isDateRetained(date)) ||
      isRangeLoaded(loadedRanges, date, date);

    const totals = local
      ? dayTotals(local)
      : summary
        ? { energyKcal: summary.energyKcal, mealsLogged: summary.mealsLogged }
        : null;

    states.set(
      date,
      dayState({
        date,
        today,
        known,
        facts:
          totals === null
            ? null
            : { ...totals, targetKcal: summary?.targetKcal ?? targetCalories },
      }),
    );
  }
  return states;
}
