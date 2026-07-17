/**
 * Canonical nutrient registry for the food catalog. These keys are the only
 * nutrient identifiers accepted in `foods.nutrients` maps, API payloads, and
 * UI code, and every value is stored PER 100 base units (g or ml) in the
 * key's canonical unit.
 *
 * APPEND-ONLY: never rename, remove, or reuse a key, and never change a key's
 * unit or meaning — stored food rows and old app versions reference these keys
 * forever. Add new nutrients at the end of their group with a fresh sortOrder.
 */
import { z } from "zod";

export type NutrientUnit = "g" | "mg" | "ug";

export type NutrientGroup = "carb" | "fat" | "mineral" | "vitamin" | "other";

export type NutrientInfo = {
  /** Human-readable label, e.g. for nutrition-facts rows. */
  displayName: string;
  /** Canonical storage unit; values are per 100 base units of the food. */
  unit: NutrientUnit;
  group: NutrientGroup;
  /** Display position within the full nutrient list (ascending). */
  sortOrder: number;
};

export const NUTRIENTS = {
  // carb
  fiber: { displayName: "Fiber", unit: "g", group: "carb", sortOrder: 10 },
  total_sugars: {
    displayName: "Total Sugars",
    unit: "g",
    group: "carb",
    sortOrder: 20,
  },
  added_sugars: {
    displayName: "Added Sugars",
    unit: "g",
    group: "carb",
    sortOrder: 30,
  },
  sugar_alcohols: {
    displayName: "Sugar Alcohols",
    unit: "g",
    group: "carb",
    sortOrder: 40,
  },
  // fat
  saturated_fat: {
    displayName: "Saturated Fat",
    unit: "g",
    group: "fat",
    sortOrder: 110,
  },
  trans_fat: {
    displayName: "Trans Fat",
    unit: "g",
    group: "fat",
    sortOrder: 120,
  },
  monounsaturated_fat: {
    displayName: "Monounsaturated Fat",
    unit: "g",
    group: "fat",
    sortOrder: 130,
  },
  polyunsaturated_fat: {
    displayName: "Polyunsaturated Fat",
    unit: "g",
    group: "fat",
    sortOrder: 140,
  },
  omega_3: { displayName: "Omega-3", unit: "g", group: "fat", sortOrder: 150 },
  omega_6: { displayName: "Omega-6", unit: "g", group: "fat", sortOrder: 160 },
  cholesterol: {
    displayName: "Cholesterol",
    unit: "mg",
    group: "fat",
    sortOrder: 170,
  },
  // mineral
  sodium: {
    displayName: "Sodium",
    unit: "mg",
    group: "mineral",
    sortOrder: 210,
  },
  potassium: {
    displayName: "Potassium",
    unit: "mg",
    group: "mineral",
    sortOrder: 220,
  },
  calcium: {
    displayName: "Calcium",
    unit: "mg",
    group: "mineral",
    sortOrder: 230,
  },
  iron: { displayName: "Iron", unit: "mg", group: "mineral", sortOrder: 240 },
  magnesium: {
    displayName: "Magnesium",
    unit: "mg",
    group: "mineral",
    sortOrder: 250,
  },
  zinc: { displayName: "Zinc", unit: "mg", group: "mineral", sortOrder: 260 },
  phosphorus: {
    displayName: "Phosphorus",
    unit: "mg",
    group: "mineral",
    sortOrder: 270,
  },
  selenium: {
    displayName: "Selenium",
    unit: "ug",
    group: "mineral",
    sortOrder: 280,
  },
  copper: {
    displayName: "Copper",
    unit: "mg",
    group: "mineral",
    sortOrder: 290,
  },
  manganese: {
    displayName: "Manganese",
    unit: "mg",
    group: "mineral",
    sortOrder: 300,
  },
  // vitamin
  vitamin_a: {
    displayName: "Vitamin A",
    unit: "ug",
    group: "vitamin",
    sortOrder: 310,
  },
  vitamin_c: {
    displayName: "Vitamin C",
    unit: "mg",
    group: "vitamin",
    sortOrder: 320,
  },
  vitamin_d: {
    displayName: "Vitamin D",
    unit: "ug",
    group: "vitamin",
    sortOrder: 330,
  },
  vitamin_e: {
    displayName: "Vitamin E",
    unit: "mg",
    group: "vitamin",
    sortOrder: 340,
  },
  vitamin_k: {
    displayName: "Vitamin K",
    unit: "ug",
    group: "vitamin",
    sortOrder: 350,
  },
  thiamin: {
    displayName: "Thiamin",
    unit: "mg",
    group: "vitamin",
    sortOrder: 360,
  },
  riboflavin: {
    displayName: "Riboflavin",
    unit: "mg",
    group: "vitamin",
    sortOrder: 370,
  },
  niacin: {
    displayName: "Niacin",
    unit: "mg",
    group: "vitamin",
    sortOrder: 380,
  },
  vitamin_b6: {
    displayName: "Vitamin B6",
    unit: "mg",
    group: "vitamin",
    sortOrder: 390,
  },
  folate: {
    displayName: "Folate",
    unit: "ug",
    group: "vitamin",
    sortOrder: 400,
  },
  vitamin_b12: {
    displayName: "Vitamin B12",
    unit: "ug",
    group: "vitamin",
    sortOrder: 410,
  },
  // other
  caffeine: {
    displayName: "Caffeine",
    unit: "mg",
    group: "other",
    sortOrder: 510,
  },
  alcohol: {
    displayName: "Alcohol",
    unit: "g",
    group: "other",
    sortOrder: 520,
  },
  water: { displayName: "Water", unit: "g", group: "other", sortOrder: 530 },
} as const satisfies Record<string, NutrientInfo>;

export type NutrientKey = keyof typeof NUTRIENTS;

/** Sparse nutrient map; values in the key's canonical unit per 100 base units. */
export type NutrientMap = Partial<Record<NutrientKey, number>>;

/**
 * Validates a nutrient map: known keys only, finite values >= 0 (zod rejects
 * NaN/Infinity for z.number() by default), empty object allowed.
 */
export const nutrientMapSchema = z
  .record(z.string(), z.number().min(0))
  .superRefine((map, ctx) => {
    for (const key of Object.keys(map)) {
      if (!Object.hasOwn(NUTRIENTS, key)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `Unknown nutrient key "${key}"; keys must be defined in NUTRIENTS`,
        });
      }
    }
  })
  .transform((map) => map as NutrientMap);
