/**
 * The food diary shown on the Log tab and written to by the add-food screen.
 * Kept in a global zustand store (not component state) because the add-food
 * modal is a separate route from the Log tab.
 *
 * Persisted on-device via MMKV (see ./storage) as an interim before the backend.
 * Entries are keyed by local date so a future date switcher and backend sync can
 * read/write individual days; only a rolling window of recent days is kept
 * locally (older days will be fetched from the backend). A pruned "recently
 * logged" list backs the add-food screen's recents fallback. MMKV is synchronous,
 * so the store hydrates during creation — no empty-state flash on launch.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type {
  DiaryEntry,
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

/** How many recent days to keep on-device; older days live on the backend. */
const MAX_LOCAL_DAYS = 7;
/** Cap on the "recently logged" list backing the add-food fallback. */
const MAX_RECENTS = 20;

/** Local `YYYY-MM-DD` for a date — the key into `entriesByDate`. */
function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Drop all but the most recent `MAX_LOCAL_DAYS` days (ISO keys sort chronologically). */
function pruneDays(byDate: Record<string, EntriesByMeal>): Record<string, EntriesByMeal> {
  const keys = Object.keys(byDate);
  if (keys.length <= MAX_LOCAL_DAYS) return byDate;
  const keep = keys.sort().slice(-MAX_LOCAL_DAYS);
  return Object.fromEntries(keep.map((k) => [k, byDate[k]]));
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

/** Fields written to disk; `currentDate` is derived fresh each launch, not persisted. */
type PersistedDiary = {
  entriesByDate: Record<string, EntriesByMeal>;
  recentFoods: DiaryFood[];
};

type DiaryState = PersistedDiary & {
  currentDate: string;
  addEntries: (mealId: MealId, foods: DiaryFood[]) => void;
  updateEntry: (mealId: MealId, entryId: string, patch: EntryPatch) => void;
  removeEntry: (mealId: MealId, entryId: string) => void;
  setDate: (date: string) => void;
};

let entryCounter = 0;
const makeEntryId = () => `entry-${Date.now()}-${entryCounter++}`;

export const useDiary = create<DiaryState>()(
  persist(
    (set) => ({
      entriesByDate: {},
      recentFoods: [],
      currentDate: todayKey(),
      addEntries: (mealId, foods) =>
        set((state) => {
          const day = state.entriesByDate[state.currentDate] ?? emptyEntries();
          const added = foods.map<DiaryEntry>((food) => ({
            entryId: makeEntryId(),
            ...food,
          }));
          return {
            entriesByDate: pruneDays({
              ...state.entriesByDate,
              [state.currentDate]: { ...day, [mealId]: [...day[mealId], ...added] },
            }),
            recentFoods: addRecents(state.recentFoods, foods),
          };
        }),
      updateEntry: (mealId, entryId, patch) =>
        set((state) => {
          const day = state.entriesByDate[state.currentDate] ?? emptyEntries();
          return {
            entriesByDate: {
              ...state.entriesByDate,
              [state.currentDate]: {
                ...day,
                [mealId]: day[mealId].map((entry) =>
                  entry.entryId === entryId ? { ...entry, ...patch } : entry,
                ),
              },
            },
          };
        }),
      removeEntry: (mealId, entryId) =>
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
          };
        }),
      setDate: (date) => set({ currentDate: date }),
    }),
    {
      name: "metabolizm-diary",
      version: 2,
      storage: createJSONStorage(() => zustandMmkvStorage),
      partialize: (state): PersistedDiary => ({
        entriesByDate: state.entriesByDate,
        recentFoods: state.recentFoods,
      }),
      // v1 stored USDA data: `entry.fdcId` held an FDC id (doesn't resolve
      // against the catalog API) and recents held the old search-item shape.
      // Keep the entries — their display fields are denormalized — but drop
      // the dead ids (those entries become non-editable, which the Log UI
      // already handles) and clear the recents.
      migrate: (persisted, version): PersistedDiary => {
        const saved = (persisted ?? {}) as PersistedDiary;
        if (version >= 2) return saved;
        const v1 = (persisted ?? {}) as {
          entriesByDate?: Record<string, Record<string, (DiaryEntry & { fdcId?: string })[]>>;
        };
        const entriesByDate = Object.fromEntries(
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
        return { entriesByDate, recentFoods: [] };
      },
      // Prune the window and reset the selected day to today on every hydrate.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedDiary>;
        return {
          ...current,
          entriesByDate: pruneDays(saved.entriesByDate ?? {}),
          recentFoods: saved.recentFoods ?? [],
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

/** Coerce a raw route param to a known meal id, defaulting to breakfast. */
export function toMealId(value: string): MealId {
  return MEALS.some((m) => m.id === value) ? (value as MealId) : "breakfast";
}
