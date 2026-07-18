/**
 * Data shapes for the food diary — what a logged day looks like on the wire
 * and on disk. The zustand store that manages them lives in the mobile app
 * (src/store/diary.ts); a future backend reads/writes the same shapes.
 */

import type { Macros } from "./health";

/** Dominant-macro accent, mapped to the theme's macro colors for the row dot. */
export type FoodAccent = "protein" | "carbs" | "fat";

/** A choosable amount unit for a food: a display label and its size in base units. */
export type FoodUnit = {
  /** e.g. "Grams", "Ounces", "1 cup (240 g)". */
  label: string;
  /**
   * Base units (g or ml, per the food's baseUnit) for one of this unit — e.g.
   * 1 for grams, 28.35 for oz, 240 for "1 cup". Named `grams` historically;
   * the name is frozen because logged entries persist it on-device.
   */
  grams: number;
};

export type MealId = "breakfast" | "lunch" | "dinner" | "snack";

/** A single logged food. `entryId` is unique per instance (a food can be logged twice). */
export type DiaryEntry = {
  entryId: string;
  name: string;
  serving: string;
  calories: number;
  macros: Macros;
  accent: FoodAccent;
  verified: boolean;
  /** Catalog food UUID, so the entry can be reopened/edited on the nutrition screen. */
  foodId?: string;
  /** Amount + unit chosen on the nutrition screen (absent for quick-added foods). */
  quantity?: number;
  unit?: FoodUnit;
};

/**
 * A food configured for logging but not yet (or not necessarily) in the diary —
 * a `DiaryEntry` minus its per-instance id. The add-food selection, the recents
 * list, and the nutrition screen's "Save" all trade in this shape.
 */
export type DiaryFood = Omit<DiaryEntry, "entryId" | "foodId"> & { foodId: string };

export type Meal = {
  id: MealId;
  label: string;
  entries: DiaryEntry[];
};

/** Fields the nutrition screen recomputes when a logged food's amount is edited. */
export type EntryPatch = Pick<DiaryEntry, "serving" | "calories" | "macros" | "quantity" | "unit">;
