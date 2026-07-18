/**
 * The add-food screen's multi-select, lifted out of component state so the
 * pushed nutrition-info route (a separate screen) can add a configured food to
 * the same selection. Intentionally NOT persisted — it's transient UI state for
 * one add-food session; the add-food screen clears it on mount and after
 * committing to the diary.
 */

import { create } from "zustand";

import type { DiaryFood } from "@metabolizm/shared";

type FoodSelectionState = {
  items: Record<string, DiaryFood>;
  /** Add/remove by food id — the "+" quick-add on a search row. */
  toggle: (food: DiaryFood) => void;
  /** Add or replace by food id — the nutrition-info screen's "Save" (with chosen amount). */
  upsert: (food: DiaryFood) => void;
  remove: (foodId: string) => void;
  clear: () => void;
};

export const useFoodSelection = create<FoodSelectionState>((set) => ({
  items: {},
  toggle: (food) =>
    set((state) => {
      if (state.items[food.foodId]) {
        const { [food.foodId]: _removed, ...rest } = state.items;
        return { items: rest };
      }
      return { items: { ...state.items, [food.foodId]: food } };
    }),
  upsert: (food) => set((state) => ({ items: { ...state.items, [food.foodId]: food } })),
  remove: (foodId) =>
    set((state) => {
      const { [foodId]: _removed, ...rest } = state.items;
      return { items: rest };
    }),
  clear: () => set({ items: {} }),
}));
