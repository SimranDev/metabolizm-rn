/**
 * Cached daily rollups for the day switcher — and only for the days the diary
 * store can't answer itself.
 *
 * The division of labour matters and is one-directional. `daily_summaries` is a
 * PROJECTION of diary entries, not an independently authored record, so there
 * is no conflict to resolve between the two and nothing here ever overwrites a
 * locally-derived total: the diary store's entries win for every day they
 * cover, and this cache is consulted only for days outside that window (see
 * `useDayFacts`). If they disagree on a covered day the local copy is right —
 * there is an unsent write in the outbox, or one about to drain.
 *
 * The exception is `streak`, which can span far more history than the device
 * keeps and therefore has to come from the server. It is persisted so the
 * header pill paints from disk instantly and is only ever REPLACED by a fetched
 * value, never blanked to 0 while a request is in flight.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { summariesApi } from "@/lib/api";
import { addDays, dayKey } from "@/lib/dates";
import type { DaySummaryDto } from "@metabolizm/shared";

import { zustandMmkvStorage } from "./storage";

/**
 * How many cached day rows to keep. A row is ~120 bytes of JSON, so this is
 * about 50 KB — cheap enough that browsing back through a year of calendar
 * stays instant on the second visit.
 */
const MAX_CACHED_DAYS = 400;

type Status = "idle" | "loading" | "ready" | "error";

type PersistedSummaries = {
  byDate: Record<string, DaySummaryDto>;
  /** Inclusive ranges we have actually fetched, so a gap reads as "unseen". */
  loaded: { from: string; to: string }[];
  streak: number;
  /** The server's notion of the caller's today, per users.timezone. */
  serverToday: string | null;
};

type SummariesState = PersistedSummaries & {
  status: Status;
  /**
   * Fetch a range unless it is already covered. Safe to call on every open.
   * `force` re-fetches a covered range — used after a diary write, where the
   * streak and the affected day have genuinely changed.
   */
  loadRange: (from: string, to: string, force?: boolean) => Promise<void>;
  reset: () => void;
};

/** Merge a range into the loaded list, coalescing anything it touches. */
function addRange(
  ranges: { from: string; to: string }[],
  next: { from: string; to: string },
): { from: string; to: string }[] {
  let { from, to } = next;
  const disjoint: { from: string; to: string }[] = [];
  for (const range of ranges) {
    // Adjacent counts as overlapping — [1..5] and [6..9] are one range.
    if (range.to < addDays(from, -1) || range.from > addDays(to, 1)) {
      disjoint.push(range);
      continue;
    }
    if (range.from < from) from = range.from;
    if (range.to > to) to = range.to;
  }
  return [...disjoint, { from, to }].sort((a, b) => a.from.localeCompare(b.from));
}

export function isRangeLoaded(
  ranges: { from: string; to: string }[],
  from: string,
  to: string,
): boolean {
  return ranges.some((r) => r.from <= from && r.to >= to);
}

/** Drop the oldest rows past the cap, and any loaded range they leave behind. */
function prune(state: PersistedSummaries): PersistedSummaries {
  const dates = Object.keys(state.byDate);
  if (dates.length <= MAX_CACHED_DAYS) return state;
  const keep = new Set(dates.sort().slice(-MAX_CACHED_DAYS));
  const oldest = [...keep].sort()[0];
  return {
    ...state,
    byDate: Object.fromEntries([...keep].map((d) => [d, state.byDate[d]])),
    // Anything before the surviving window is no longer backed by rows, so it
    // must stop claiming to be loaded or those days would render as empty.
    loaded: state.loaded
      .filter((r) => r.to >= oldest)
      .map((r) => (r.from < oldest ? { ...r, from: oldest } : r)),
  };
}

export const useSummaries = create<SummariesState>()(
  persist(
    (set, get) => ({
      byDate: {},
      loaded: [],
      streak: 0,
      serverToday: null,
      status: "idle",

      loadRange: async (from, to, force = false) => {
        if (
          !force &&
          isRangeLoaded(get().loaded, from, to) &&
          get().status === "ready"
        ) {
          return;
        }
        set({ status: "loading" });
        try {
          const response = await summariesApi.listDays({ from, to });
          set((state) => {
            const byDate = { ...state.byDate };
            // Clear the window first: a day that HAD a row and no longer does
            // (every entry deleted elsewhere) must disappear, not linger.
            for (const date of Object.keys(byDate)) {
              if (date >= from && date <= to) delete byDate[date];
            }
            for (const day of response.days) byDate[day.date] = day;
            return {
              ...prune({
                byDate,
                loaded: addRange(state.loaded, { from, to }),
                streak: response.loggingStreak,
                serverToday: response.today,
              }),
              status: "ready",
            };
          });
        } catch {
          // Offline or signed out. Whatever is cached stays on screen — a
          // failed refresh must not blank a calendar the user can still read.
          set({ status: "error" });
        }
      },

      reset: () =>
        set({
          byDate: {},
          loaded: [],
          streak: 0,
          serverToday: null,
          status: "idle",
        }),
    }),
    {
      name: "metabolizm-summaries",
      version: 1,
      storage: createJSONStorage(() => zustandMmkvStorage),
      partialize: (state): PersistedSummaries => ({
        byDate: state.byDate,
        loaded: state.loaded,
        streak: state.streak,
        serverToday: state.serverToday,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedSummaries>;
        return {
          ...current,
          byDate: saved.byDate ?? {},
          loaded: saved.loaded ?? [],
          streak: saved.streak ?? 0,
          // Deliberately dropped on rehydrate: a "today" from a previous launch
          // is stale by definition, and a stale one would misplace the strip's
          // highlight until the first fetch landed.
          serverToday: null,
        };
      },
    },
  ),
);

/**
 * Refresh the streak and the window around today. Called after a diary write,
 * where the streak may have just changed — never on cold start, where the strip
 * already has everything it needs on disk.
 */
export function refreshStreak(): void {
  const today = dayKey();
  void useSummaries.getState().loadRange(addDays(today, -6), today, true);
}
