/**
 * Display + portion math for catalog foods. All catalog values are stored per
 * 100 base units (g|ml) — these helpers scale them to a chosen amount and
 * shape DTOs for the Log UI at display time.
 */

import type {
  DiaryFood,
  FoodAccent,
  FoodDto,
  FoodListItemDto,
  FoodUnit,
  NutrientMap,
} from "@metabolizm/shared";

/** Grams per ounce (mass) and per fluid ounce (volume; density approximated 1 g/ml). */
export const G_PER_OZ = 28.3495;
export const G_PER_FL_OZ = 29.5735;

/** Round to one decimal place. */
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Compact amount formatter: whole numbers plain, otherwise one decimal. */
export const formatGrams = (n: number) => (n % 1 === 0 ? n.toFixed(0) : n.toFixed(1));

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Dominant macro by calorie contribution; defaults to protein when all zero. */
export function dominantMacro(proteinG: number, carbsG: number, fatG: number): FoodAccent {
  const kcal = {
    protein: proteinG * KCAL_PER_G.protein,
    carbs: carbsG * KCAL_PER_G.carbs,
    fat: fatG * KCAL_PER_G.fat,
  };
  let best: FoodAccent = "protein";
  if (kcal.carbs > kcal[best]) best = "carbs";
  if (kcal.fat > kcal[best]) best = "fat";
  return best;
}

/** Display name with the brand appended, e.g. "Greek Yogurt (Fage)". */
export const displayName = (name: string, brand: string | null): string =>
  brand ? `${name} (${brand})` : name;

/**
 * Search-row basis: the default portion when the food has one, else per 100
 * base units. `calories` is scaled to that basis.
 */
export function listItemDisplay(item: FoodListItemDto): { calories: number; serving: string } {
  if (item.defaultPortion) {
    return {
      calories: Math.round((item.energyKcal * item.defaultPortion.amountInBase) / 100),
      serving: `per ${item.defaultPortion.label}`,
    };
  }
  return { calories: Math.round(item.energyKcal), serving: `per 100 ${item.baseUnit}` };
}

/** Base units offered for every food, chosen by its base unit (solid vs liquid). */
const BASE_UNITS: Record<FoodDto["baseUnit"], FoodUnit[]> = {
  g: [
    { label: "Grams", grams: 1 },
    { label: "Ounces", grams: G_PER_OZ },
  ],
  ml: [
    // `grams` is really "base units": 1 ml for milliliters, 29.57 for fl oz.
    { label: "Milliliters", grams: 1 },
    { label: "Fluid ounces", grams: G_PER_FL_OZ },
  ],
};

/**
 * Selectable amount units for a food: the base units (grams/oz or ml/fl-oz)
 * followed by each of the food's portions. `defaultUnitIndex` prefers the
 * default portion (portions arrive default-first), else the base unit.
 */
export function buildUnits(food: FoodDto): { units: FoodUnit[]; defaultUnitIndex: number } {
  const base = BASE_UNITS[food.baseUnit];
  const portionUnits = food.portions.map<FoodUnit>((p) => ({
    label: `${p.label} (${formatGrams(p.amountInBase)} ${food.baseUnit})`,
    grams: p.amountInBase,
  }));
  const defaultIdx = food.portions.findIndex((p) => p.isDefault);
  return {
    units: [...base, ...portionUnits],
    defaultUnitIndex:
      food.portions.length > 0 ? base.length + Math.max(defaultIdx, 0) : 0,
  };
}

/** Scale a per-100 value to `amount` base units. */
export const scalePer100 = (per100: number, amount: number): number => (per100 * amount) / 100;

/** Rescale a per-100 nutrient map to `amount` base units (values unrounded). */
export function scaleNutrients(map: NutrientMap, amount: number): NutrientMap {
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [key, scalePer100(value, amount)]),
  ) as NutrientMap;
}

/** Calories + macros + micros of a food scaled to `amount` base units. */
export function scaleFood(
  food: FoodDto,
  amount: number,
): { calories: number; proteinG: number; carbsG: number; fatG: number; nutrients: NutrientMap } {
  const a = Number.isFinite(amount) && amount > 0 ? amount : 0;
  return {
    calories: Math.round(scalePer100(food.energyKcal, a)),
    proteinG: round1(scalePer100(food.proteinG, a)),
    carbsG: round1(scalePer100(food.carbsG, a)),
    fatG: round1(scalePer100(food.fatG, a)),
    nutrients: scaleNutrients(food.nutrients, a),
  };
}

/** Quick-add draft from a search row, on the row's displayed basis. */
export function toQuickAdd(item: FoodListItemDto): DiaryFood {
  const amount = item.defaultPortion?.amountInBase ?? 100;
  const { calories, serving } = listItemDisplay(item);
  return {
    foodId: item.id,
    name: displayName(item.name, item.brand),
    serving,
    calories,
    macros: {
      proteinG: round1(scalePer100(item.proteinG, amount)),
      carbsG: round1(scalePer100(item.carbsG, amount)),
      fatG: round1(scalePer100(item.fatG, amount)),
    },
    accent: dominantMacro(item.proteinG, item.carbsG, item.fatG),
    verified: item.isVerified,
  };
}
