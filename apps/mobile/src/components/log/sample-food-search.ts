/**
 * Static config for the "add food" search screen. Live search hits the catalog
 * API (see `@/lib/api`); the empty-query "recent" list comes from the
 * persisted diary store (`useDiary().recentFoods`), not from here.
 */

/** Filters above the results list. Only "All"/"History" show recents for now. */
export const FOOD_FILTERS = [
  { id: "all", label: "All" },
  { id: "history", label: "History" },
  { id: "meals", label: "Meals" },
  { id: "myfoods", label: "My Foods" },
] as const;

export type FoodFilterId = (typeof FOOD_FILTERS)[number]["id"];

/** Input methods. Only "search" is functional for now; the rest are placeholders. */
export const INPUT_METHODS = [
  { id: "search", label: "Search", icon: "magnifying-glass" },
  { id: "photo", label: "Photo", icon: "camera" },
  { id: "voice", label: "Voice", icon: "microphone" },
  { id: "barcode", label: "Barcode", icon: "barcode" },
] as const;

export type InputMethodId = (typeof INPUT_METHODS)[number]["id"];

/** Display label for a meal id, e.g. "dinner" → "Dinner". */
export function mealLabel(meal: string): string {
  return meal.charAt(0).toUpperCase() + meal.slice(1);
}
