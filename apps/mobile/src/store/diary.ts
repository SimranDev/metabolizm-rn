/**
 * The food diary shown on the Log tab and written to by the add-food screen.
 * Kept in a global zustand store (not component state) because the add-food
 * modal is a separate route from the Log tab.
 *
 * MMKV (see ./storage) is the READ path: it is synchronous, so the store
 * hydrates during creation and the Log tab paints without an empty-state flash,
 * then reconciles with the server in the background. Same shape as the weight
 * store, and for the same reason.
 *
 * Writes are local-first with an outbox. Every mutation applies on-device
 * immediately and queues a push; `sync()` drains the queue and then pulls the
 * server delta. Entry ids are client-generated UUIDv7, which is what makes a
 * replayed push an idempotent upsert instead of a duplicate meal.
 *
 * Entries are keyed by local date so the date switcher and the delta pull can
 * read/write individual days; only a rolling window of recent days is kept
 * locally. A pruned "recently logged" list backs the add-food recents fallback.
 */

import { AppState } from "react-native";
import { uuidv7 } from "uuidv7";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ApiError, diaryApi } from "@/lib/api";
import { addDays, dayKey } from "@/lib/dates";
import { fromDto, toUpsert } from "@/lib/diary";
import { DIARY_MAX_FUTURE_DAYS } from "@metabolizm/shared";
import type {
  DiaryEntry,
  DiaryEntryDto,
  DiaryEntryUpsert,
  DiaryFood,
  EntryPatch,
  Macros,
  Meal,
  MealId,
} from "@metabolizm/shared";

import { zustandMmkvStorage } from "./storage";

/** Meal identity + display order for the Log tab. */
const MEALS: { id: MealId; label: string }[] = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snack", label: "Snack" },
];

type EntriesByMeal = Record<MealId, DiaryEntry[]>;

const emptyEntries = (): EntriesByMeal => ({
  breakfast: [],
  lunch: [],
  dinner: [],
  snack: [],
});

/**
 * How much history stays on-device, as a window ANCHORED ON TODAY rather than
 * a count of the most recent days.
 *
 * The anchor is the whole point: keeping "the N latest keys" worked only while
 * every key was in the past. Once a day can be planned three weeks ahead, the
 * future days are the chronologically largest and a plain `slice(-N)` evicts
 * today and all history along with it.
 *
 * 90 days is deliberately generous — MMKV is mmap'd and synchronous, and this
 * is a few hundred KB — because it is what makes the day switcher scroll back
 * through a season instantly and offline, with no request at all.
 */
const RETAIN_PAST_DAYS = 90;
/** One past the plannable horizon, so every day the UI offers stays local. */
const RETAIN_FUTURE_DAYS = DIARY_MAX_FUTURE_DAYS + 1;
/** Cap on the "recently logged" list backing the add-food fallback. */
const MAX_RECENTS = 20;

/**
 * Local `YYYY-MM-DD` for a date — the key into `entriesByDate`.
 *
 * Re-exported from lib/dates, which is now the single implementation of this;
 * the name stays because entries, widgets and onboarding all import it here.
 */
export const todayKey = dayKey;

/** Inclusive bounds of the retained window around today. */
function retentionWindow(): { from: string; to: string } {
  const today = dayKey();
  return {
    from: addDays(today, -RETAIN_PAST_DAYS),
    to: addDays(today, RETAIN_FUTURE_DAYS),
  };
}

/**
 * Drop days outside the retained window, always keeping `pinned` (the day being
 * viewed). Without the pin, browsing to an old month would fetch that day and
 * then immediately evict it on the next sync, blanking the screen underneath
 * the user.
 */
function pruneDays(
  byDate: Record<string, EntriesByMeal>,
  pinned?: string,
): Record<string, EntriesByMeal> {
  const { from, to } = retentionWindow();
  const kept = Object.entries(byDate).filter(
    ([date]) => (date >= from && date <= to) || date === pinned,
  );
  if (kept.length === Object.keys(byDate).length) return byDate;
  return Object.fromEntries(kept);
}

/** Prepend newly logged foods to recents, deduped by food id (newest wins), capped. */
function addRecents(recents: DiaryFood[], foods: DiaryFood[]): DiaryFood[] {
  const seen = new Set<string>();
  const deduped: DiaryFood[] = [];
  for (const food of [...foods, ...recents]) {
    if (seen.has(food.foodId)) continue;
    seen.add(food.foodId);
    deduped.push(food);
  }
  return deduped.slice(0, MAX_RECENTS);
}

/** Server pushes go out in batches of at most this many (upsertDiaryEntriesSchema). */
const MAX_PUSH_BATCH = 50;

/**
 * Fold server rows into a meal's entries.
 *
 * Existing rows keep their position and only have their contents replaced;
 * genuinely new rows are appended. Deliberately NOT a re-sort: reordering keyed
 * rows in a list that is already mounted crashes Fabric on RN 0.86 Android
 * (`addViewAt`), and a background pull can land while the Log tab is on screen.
 */
function mergeMeal(existing: DiaryEntry[], incoming: Map<string, DiaryEntry>): DiaryEntry[] {
  const merged = existing.map((entry) => incoming.get(entry.entryId) ?? entry);
  const seen = new Set(existing.map((e) => e.entryId));
  for (const [id, entry] of incoming) {
    if (!seen.has(id)) merged.push(entry);
  }
  return merged;
}

/** Replace any queued push for the same entry — only the latest state matters. */
function enqueue(outbox: DiaryEntryUpsert[], next: DiaryEntryUpsert): DiaryEntryUpsert[] {
  return [...outbox.filter((q) => q.id !== next.id), next];
}

/**
 * A failure the server will never accept, however many times we retry — a
 * validation error on a malformed row, or a row referencing a food that is
 * gone. Those have to leave the queue: the push is atomic per batch, so one
 * permanently-bad entry would otherwise wedge the outbox and block every later
 * write from ever syncing. 401/403 are excluded (sign in and it works) and so
 * is 429 (back off and it works).
 */
function isPermanent(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status === 401 || err.status === 403 || err.status === 429) return false;
  return err.status >= 400 && err.status < 500;
}

type SetState = (
  partial: Partial<DiaryState> | ((state: DiaryState) => Partial<DiaryState>),
) => void;
type GetState = () => DiaryState;

/** Send queued writes. Throws on a transient failure so the caller stops and retries later. */
async function pushOutbox(set: SetState, get: GetState): Promise<void> {
  while (get().outbox.length > 0) {
    const batch = get().outbox.slice(0, MAX_PUSH_BATCH);
    const ids = new Set(batch.map((entry) => entry.id));
    try {
      await diaryApi.upsertEntries(batch);
    } catch (err) {
      if (!isPermanent(err)) throw err;
    }
    set((state) => ({ outbox: state.outbox.filter((q) => !ids.has(q.id)) }));
  }

  for (const id of [...get().deleteOutbox]) {
    try {
      await diaryApi.deleteEntry(id);
    } catch (err) {
      // 404 means the server never had it (created and deleted while offline,
      // or already tombstoned) — the desired end state either way.
      const gone = err instanceof ApiError && err.status === 404;
      if (!gone && !isPermanent(err)) throw err;
    }
    set((state) => ({ deleteOutbox: state.deleteOutbox.filter((queued) => queued !== id) }));
  }
}

/** Fold one page of server rows into the local days. */
function applyPage(set: SetState, get: GetState, dtos: DiaryEntryDto[]): void {
  if (dtos.length === 0) return;
  const state = get();
  // Local pending writes outrank anything the server hands back: those edits
  // and deletes have not been acknowledged yet, so the server's copy is stale.
  const pending = new Set([...state.outbox.map((q) => q.id), ...state.deleteOutbox]);

  const alive = new Map<string, Map<MealId, Map<string, DiaryEntry>>>();
  const tombstoned = new Set<string>();

  for (const dto of dtos) {
    if (pending.has(dto.id)) continue;
    if (dto.deletedAt !== null) {
      tombstoned.add(dto.id);
      continue;
    }
    const { entry, entryDate, meal } = fromDto(dto);
    const byMeal = alive.get(entryDate) ?? new Map<MealId, Map<string, DiaryEntry>>();
    const inMeal = byMeal.get(meal) ?? new Map<string, DiaryEntry>();
    inMeal.set(entry.entryId, entry);
    byMeal.set(meal, inMeal);
    alive.set(entryDate, byMeal);
  }

  const dates: Set<string> = new Set([
    ...Object.keys(state.entriesByDate),
    ...alive.keys(),
  ]);
  const next: Record<string, EntriesByMeal> = {};
  for (const date of dates) {
    const current = state.entriesByDate[date] ?? emptyEntries();
    const incoming = alive.get(date);
    // Reuse the existing object when this page says nothing about this day.
    // The Log tab subscribes to `entriesByDate[currentDate]` by reference, so
    // rebuilding untouched days would re-render it on every background pull.
    const touched =
      incoming !== undefined ||
      (tombstoned.size > 0 &&
        MEALS.some(({ id }) => current[id].some((e) => tombstoned.has(e.entryId))));
    if (!touched) {
      next[date] = current;
      continue;
    }
    next[date] = MEALS.reduce((day, { id }) => {
      const kept = tombstoned.size
        ? current[id].filter((entry) => !tombstoned.has(entry.entryId))
        : current[id];
      day[id] = mergeMeal(kept, incoming?.get(id) ?? new Map());
      return day;
    }, emptyEntries());
  }

  set({ entriesByDate: pruneDays(next, get().currentDate) });
}

/** Walk the keyset cursor until the server has nothing newer. */
async function pullDelta(set: SetState, get: GetState): Promise<void> {
  // A bound, not a real limit: at 200 rows a page this covers 20k entries, and
  // it stops a bad cursor from looping forever.
  for (let page = 0; page < 100; page++) {
    const response = await diaryApi.sync({ since: get().cursor ?? undefined, limit: 200 });
    applyPage(set, get, response.entries);
    // Only advance on a real cursor — writing null back would restart the pull
    // from the beginning of history on the next sync.
    if (response.nextCursor) set({ cursor: response.nextCursor });
    if (!response.hasMore) return;
  }
}

/** Fields written to disk; `currentDate` is derived fresh each launch, not persisted. */
type PersistedDiary = {
  entriesByDate: Record<string, EntriesByMeal>;
  recentFoods: DiaryFood[];
  /** Writes not yet acknowledged by the server, newest last. */
  outbox: DiaryEntryUpsert[];
  /** Entry ids deleted on-device whose tombstone has not been pushed yet. */
  deleteOutbox: string[];
  /** Opaque keyset cursor from the last successful delta pull. */
  cursor: string | null;
  /**
   * ISO timestamp of the last delta pull that ran to completion.
   *
   * The precise thing it licenses: once a full pull has landed, a day inside
   * the retained window with no entries really is an EMPTY day, not one we
   * haven't seen. Before that, absence proves nothing and the UI must render a
   * skeleton rather than "0 kcal". A cursor alone won't do — it advances on
   * every page, including a walk that was interrupted half way.
   */
  lastFullSync: string | null;
};

type DiaryState = PersistedDiary & {
  currentDate: string;
  syncing: boolean;
  addEntries: (mealId: MealId, foods: DiaryFood[]) => void;
  updateEntry: (mealId: MealId, entryId: string, patch: EntryPatch) => void;
  removeEntry: (mealId: MealId, entryId: string) => void;
  setDate: (date: string) => void;
  /**
   * Pull a single day the device doesn't hold — the user has browsed outside
   * the retained window. No-op for a day already present.
   */
  loadDay: (date: string) => Promise<void>;
  /** Drain the outbox, then pull the server delta. Safe to call on every focus. */
  sync: () => Promise<void>;
  /** Drop everything cached for the signed-in account. See lib/session. */
  reset: () => void;
};

/**
 * Client-generated so a replayed push is an idempotent upsert. Must be a real
 * UUID: the server validates `id` with `z.uuid()` and 400s anything else.
 */
const makeEntryId = () => uuidv7();

export const useDiary = create<DiaryState>()(
  persist(
    (set, get) => ({
      entriesByDate: {},
      recentFoods: [],
      outbox: [],
      deleteOutbox: [],
      cursor: null,
      lastFullSync: null,
      currentDate: todayKey(),
      syncing: false,

      addEntries: (mealId, foods) => {
        set((state) => {
          const day = state.entriesByDate[state.currentDate] ?? emptyEntries();
          const added = foods.map<DiaryEntry>((food) => ({
            entryId: makeEntryId(),
            loggedAt: new Date().toISOString(),
            ...food,
          }));
          return {
            entriesByDate: pruneDays(
              {
                ...state.entriesByDate,
                [state.currentDate]: { ...day, [mealId]: [...day[mealId], ...added] },
              },
              state.currentDate,
            ),
            recentFoods: addRecents(state.recentFoods, foods),
            outbox: added.reduce(
              (queue, entry) =>
                enqueue(queue, toUpsert({ entry, entryDate: state.currentDate, meal: mealId })),
              state.outbox,
            ),
          };
        });
        void get().sync();
      },

      updateEntry: (mealId, entryId, patch) => {
        set((state) => {
          const day = state.entriesByDate[state.currentDate] ?? emptyEntries();
          const entries = day[mealId].map((entry) =>
            entry.entryId === entryId ? { ...entry, ...patch } : entry,
          );
          const edited = entries.find((entry) => entry.entryId === entryId);
          return {
            entriesByDate: {
              ...state.entriesByDate,
              [state.currentDate]: { ...day, [mealId]: entries },
            },
            outbox: edited
              ? enqueue(
                  state.outbox,
                  toUpsert({ entry: edited, entryDate: state.currentDate, meal: mealId }),
                )
              : state.outbox,
          };
        });
        void get().sync();
      },

      removeEntry: (mealId, entryId) => {
        set((state) => {
          const day = state.entriesByDate[state.currentDate] ?? emptyEntries();
          return {
            entriesByDate: {
              ...state.entriesByDate,
              [state.currentDate]: {
                ...day,
                [mealId]: day[mealId].filter((entry) => entry.entryId !== entryId),
              },
            },
            // Drop any unsent push for this entry: creating it and then
            // deleting it in one offline session should be a no-op on the wire.
            outbox: state.outbox.filter((q) => q.id !== entryId),
            deleteOutbox: state.deleteOutbox.includes(entryId)
              ? state.deleteOutbox
              : [...state.deleteOutbox, entryId],
          };
        });
        void get().sync();
      },

      setDate: (date) => {
        set({ currentDate: date });
        void get().loadDay(date);
      },

      loadDay: async (date) => {
        if (get().entriesByDate[date] !== undefined) return;
        try {
          const { entries } = await diaryApi.listDays({ from: date, to: date });
          // Seed the day BEFORE folding the rows in, so it is marked present
          // even when it comes back empty. Without that an empty past day would
          // stay "unseen" forever and re-fetch on every visit.
          set((state) =>
            state.entriesByDate[date] !== undefined
              ? {}
              : { entriesByDate: { ...state.entriesByDate, [date]: emptyEntries() } },
          );
          applyPage(set, get, entries);
        } catch {
          // Offline. The day stays unknown, which the UI renders as a skeleton
          // rather than as an empty day — absence is not zero.
        }
      },

      // Unsent outbox writes are discarded, not preserved: they belong to the
      // account being signed out and could never be pushed as anyone else.
      reset: () =>
        set({
          entriesByDate: {},
          recentFoods: [],
          outbox: [],
          deleteOutbox: [],
          cursor: null,
          lastFullSync: null,
          currentDate: todayKey(),
          syncing: false,
        }),

      sync: async () => {
        if (get().syncing) return;
        set({ syncing: true });
        try {
          await pushOutbox(set, get);
          await pullDelta(set, get);
          // Only after the walk finishes: this is what lets an empty day inside
          // the window be read as genuinely empty rather than merely unseen.
          set({ lastFullSync: new Date().toISOString() });
        } catch {
          // Offline or signed out. Everything stays queued and the persisted
          // cursor is untouched, so the next call resumes exactly here. There
          // is deliberately no user-facing error: the diary still reads and
          // writes locally, which is the whole point of the outbox.
        } finally {
          set({ syncing: false });
        }
      },
    }),
    {
      name: "metabolizm-diary",
      version: 3,
      storage: createJSONStorage(() => zustandMmkvStorage),
      partialize: (state): PersistedDiary => ({
        entriesByDate: state.entriesByDate,
        recentFoods: state.recentFoods,
        outbox: state.outbox,
        deleteOutbox: state.deleteOutbox,
        cursor: state.cursor,
        lastFullSync: state.lastFullSync,
      }),
      migrate: (persisted, version): PersistedDiary => {
        const saved = (persisted ?? {}) as PersistedDiary;
        if (version >= 3) return saved;

        // v1 stored USDA data: `entry.fdcId` held an FDC id (doesn't resolve
        // against the catalog API) and recents held the old search-item shape.
        // Keep the entries — their display fields are denormalized — but drop
        // the dead ids (those entries become non-editable, which the Log UI
        // already handles) and clear the recents.
        let entriesByDate = saved.entriesByDate ?? {};
        let recentFoods = saved.recentFoods ?? [];
        if (version < 2) {
          const v1 = (persisted ?? {}) as {
            entriesByDate?: Record<string, Record<string, (DiaryEntry & { fdcId?: string })[]>>;
          };
          entriesByDate = Object.fromEntries(
            Object.entries(v1.entriesByDate ?? {}).map(([date, day]) => [
              date,
              Object.fromEntries(
                Object.entries(day).map(([mealId, entries]) => [
                  mealId,
                  entries.map(({ fdcId: _stale, ...entry }) => entry),
                ]),
              ),
            ]),
          ) as Record<string, EntriesByMeal>;
          recentFoods = [];
        }

        // v2 → v3: entry ids were `entry-<ms>-<n>`, which the server rejects
        // (`id` is validated as a UUID). Reissue them as UUIDv7 and queue the
        // whole local window for upload so history logged before sync existed
        // still reaches the account rather than being stranded on the device.
        const outbox: DiaryEntryUpsert[] = [];
        const rekeyed = Object.fromEntries(
          Object.entries(entriesByDate).map(([date, day]) => [
            date,
            MEALS.reduce((next, { id }) => {
              next[id] = (day?.[id] ?? []).map((entry) => {
                const migrated = { ...entry, entryId: uuidv7() };
                outbox.push(toUpsert({ entry: migrated, entryDate: date, meal: id }));
                return migrated;
              });
              return next;
            }, emptyEntries()),
          ]),
        );

        return {
          entriesByDate: rekeyed,
          recentFoods,
          outbox,
          deleteOutbox: [],
          cursor: null,
          lastFullSync: null,
        };
      },
      // Prune the window and reset the selected day to today on every hydrate.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedDiary>;
        return {
          ...current,
          entriesByDate: pruneDays(saved.entriesByDate ?? {}),
          recentFoods: saved.recentFoods ?? [],
          outbox: saved.outbox ?? [],
          deleteOutbox: saved.deleteOutbox ?? [],
          cursor: saved.cursor ?? null,
          lastFullSync: saved.lastFullSync ?? null,
          currentDate: todayKey(),
        };
      },
    },
  ),
);

/**
 * Stable empty day returned for dates with no entries. A shared frozen reference
 * (not a fresh `emptyEntries()`) so the selector below yields a consistent
 * snapshot — a new object each call would loop zustand's `useSyncExternalStore`.
 */
const EMPTY_DAY: EntriesByMeal = Object.freeze(emptyEntries());

/** Entries for the currently selected day, defaulting to a stable empty set. */
const dayEntries = (state: DiaryState): EntriesByMeal =>
  state.entriesByDate[state.currentDate] ?? EMPTY_DAY;

/** The meals in display order, each with the selected day's logged entries. */
export function useMeals(): Meal[] {
  const day = useDiary(dayEntries);
  return MEALS.map((meal) => ({ id: meal.id, label: meal.label, entries: day[meal.id] }));
}

/** Everything consumed on the selected day, summed across meals — drives the day summary card. */
export function useConsumed(): { calories: number; macros: Macros } {
  const day = useDiary(dayEntries);
  return MEALS.flatMap((meal) => day[meal.id]).reduce(
    (acc, entry) => ({
      calories: acc.calories + entry.calories,
      macros: {
        proteinG: acc.macros.proteinG + entry.macros.proteinG,
        carbsG: acc.macros.carbsG + entry.macros.carbsG,
        fatG: acc.macros.fatG + entry.macros.fatG,
      },
    }),
    { calories: 0, macros: { proteinG: 0, carbsG: 0, fatG: 0 } },
  );
}

/** Total logged calories for a meal — summed from its entries. */
export const mealCalories = (meal: Meal): number =>
  meal.entries.reduce((sum, entry) => sum + entry.calories, 0);

/** Calories and filled meal slots for one stored day. */
export function dayTotals(day: EntriesByMeal | undefined): {
  energyKcal: number;
  mealsLogged: number;
} {
  if (!day) return { energyKcal: 0, mealsLogged: 0 };
  let energyKcal = 0;
  let mealsLogged = 0;
  for (const { id } of MEALS) {
    const entries = day[id];
    if (entries.length > 0) mealsLogged += 1;
    for (const entry of entries) energyKcal += entry.calories;
  }
  return { energyKcal, mealsLogged };
}

/**
 * Whether `date` falls in the window the device keeps entries for. Combined
 * with a completed `lastFullSync`, this is what licenses reading an absent day
 * as EMPTY rather than as merely unseen.
 */
export function isDateRetained(date: string): boolean {
  const { from, to } = retentionWindow();
  return date >= from && date <= to;
}

/**
 * Current logging streak from local entries alone.
 *
 * `truncated` means the run was still going when it hit the edge of the
 * retained window, so the real streak is at least this long but the device
 * can't see how much longer — the one case where the server's count is needed.
 * Everything shorter is answered with no request at all.
 *
 * Counts backwards from today, or yesterday when today is still empty, so an
 * unfinished today never reads as a broken streak. Future planned days are
 * never reached and so can never inflate it.
 */
export function localStreak(
  byDate: Record<string, EntriesByMeal>,
  today: string,
): { days: number; truncated: boolean } {
  // Deliberately not dayTotals: this runs on every header render and only needs
  // to know whether the day has anything at all, not what it adds up to.
  const logged = (date: string) => {
    const day = byDate[date];
    return day !== undefined && MEALS.some(({ id }) => day[id].length > 0);
  };
  const oldest = addDays(today, -RETAIN_PAST_DAYS);

  let cursor = logged(today) ? today : addDays(today, -1);
  let days = 0;
  while (cursor >= oldest && logged(cursor)) {
    days += 1;
    cursor = addDays(cursor, -1);
  }
  return { days, truncated: days > 0 && cursor < oldest };
}

/**
 * Today's logging streak.
 *
 * Local by default — the server value is only consulted when the local run is
 * truncated, and `max` is what stops a never-fetched 0 from erasing a streak we
 * can already prove. See useStreak in the header for the fetch that fills it.
 */
export function combineStreak(
  local: { days: number; truncated: boolean },
  serverStreak: number,
): number {
  return local.truncated ? Math.max(local.days, serverStreak) : local.days;
}

/** The day the app currently considers "today"; advanced by checkDayRollover. */
let lastKnownToday = todayKey();

/**
 * Follow a midnight rollover.
 *
 * Only moves the selection when the user was sitting on what used to be today
 * — someone who deliberately navigated to Tuesday should still be on Tuesday
 * after midnight. Called on app foreground and on Log tab focus, which between
 * them cover both an app resumed the next morning and one left open overnight.
 */
export function checkDayRollover(): void {
  const today = todayKey();
  if (today === lastKnownToday) return;
  const previous = lastKnownToday;
  lastKnownToday = today;
  const state = useDiary.getState();
  if (state.currentDate === previous) state.setDate(today);
}

/** Wire the foreground half of the rollover check. Returns an unsubscribe. */
export function initDayRollover(): () => void {
  const subscription = AppState.addEventListener("change", (status) => {
    if (status === "active") checkDayRollover();
  });
  return () => subscription.remove();
}

/** Coerce a raw route param to a known meal id, defaulting to breakfast. */
export function toMealId(value: string): MealId {
  return MEALS.some((m) => m.id === value) ? (value as MealId) : "breakfast";
}
