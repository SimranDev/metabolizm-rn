/**
 * Deterministic mapper from one USDA FoodData Central food JSON (download-file
 * element or /food/{fdcId} API response — both use the nested
 * { nutrient: { id, unitName }, amount } shape) to a validated
 * createFoodSchema input. Single source of truth for both POST /api/parse
 * and scripts/import-usda.ts. All FDC values are per 100 g, matching our
 * per-100-base-unit storage directly.
 */
import {
  NUTRIENTS,
  createFoodSchema,
  type CreateFoodInput,
  type NutrientKey,
  type NutrientMap,
  type NutrientUnit,
} from "@metabolizm/shared";
import { z } from "zod";

import {
  EXCLUDED_CATEGORIES,
  cleanFoodName,
  cleanPortionLabel,
  computePopularity,
  hasBrandToken,
} from "./usda-clean";

export type UsdaSkipReason =
  | "invalid_shape"
  | "excluded_category"
  | "brand_name"
  | "no_energy"
  | "missing_macros"
  | "validation_failed";

export type UnknownNutrient = { id: number; name: string; unitName: string };

export type UsdaMapResult =
  | {
      ok: true;
      fdcId: number;
      sourceRef: string;
      input: CreateFoodInput;
      popularity: number;
      warnings: string[];
      unknownNutrients: UnknownNutrient[];
    }
  | { ok: false; reason: UsdaSkipReason; detail: string };

// Lenient shapes: only fdcId + description are hard requirements; malformed
// nutrient/portion entries are skipped individually, never failing the food.
const usdaNutrientSchema = z.object({
  nutrient: z
    .object({
      id: z.number().optional(),
      name: z.string().optional(),
      unitName: z.string().optional(),
    })
    .optional(),
  amount: z.number().optional(),
  // Foundation analytical entries sometimes carry only median/min/max.
  median: z.number().optional(),
});

const usdaPortionSchema = z.object({
  amount: z.number().optional(),
  modifier: z.string().optional(),
  gramWeight: z.number().optional(),
  measureUnit: z
    .object({
      name: z.string().optional(),
      abbreviation: z.string().optional(),
    })
    .optional(),
  portionDescription: z.string().optional(),
});

const usdaFoodSchema = z.object({
  fdcId: z.number().int().positive(),
  description: z.string().trim().min(1),
  foodCategory: z
    .union([z.string(), z.object({ description: z.string().optional() })])
    .optional(),
  foodNutrients: z.array(z.unknown()).optional(),
  foodPortions: z.array(z.unknown()).optional(),
});

// kcal ids in preference order: 1008 Energy, 2047 Atwater General, 2048
// Atwater Specific. 1062 (Energy, kJ) is deliberately ignored.
const ENERGY_IDS = [1008, 2047, 2048];
const KJ_ENERGY_ID = 1062;
const PROTEIN_ID = 1003;
const FAT_ID = 1004;
// 1050 = carbohydrate by summation, fallback when 1005 (by difference) is absent.
const CARB_IDS = [1005, 1050];
const MACRO_AND_ENERGY_IDS = new Set([
  ...ENERGY_IDS,
  KJ_ENERGY_ID,
  PROTEIN_ID,
  FAT_ID,
  ...CARB_IDS,
]);

// FDC nutrient id → registry key. `priority` disambiguates when two ids feed
// one key (lower wins), e.g. total sugars 2000 over 1063, folate DFE 1190
// over total folate 1177.
// omega_3 / omega_6 are deliberately unmapped: FDC has no single id for them,
// only component fatty acids (1404 ALA, 1278 EPA, 1272 DHA, 1316 LA, …) whose
// summation risks double-counting against undifferentiated ids — they surface
// in the unmapped histogram instead.
type FdcMapping = { key: NutrientKey; priority?: number };
const FDC_NUTRIENT_MAP: Record<number, FdcMapping> = {
  1079: { key: "fiber" },
  2000: { key: "total_sugars" },
  1063: { key: "total_sugars", priority: 1 },
  1235: { key: "added_sugars" },
  1086: { key: "sugar_alcohols" },
  1258: { key: "saturated_fat" },
  1257: { key: "trans_fat" },
  1292: { key: "monounsaturated_fat" },
  1293: { key: "polyunsaturated_fat" },
  1253: { key: "cholesterol" },
  1093: { key: "sodium" },
  1092: { key: "potassium" },
  1087: { key: "calcium" },
  1089: { key: "iron" },
  1090: { key: "magnesium" },
  1095: { key: "zinc" },
  1091: { key: "phosphorus" },
  1103: { key: "selenium" },
  1098: { key: "copper" },
  1101: { key: "manganese" },
  1106: { key: "vitamin_a" }, // µg RAE (1104 IU is not convertible)
  1162: { key: "vitamin_c" },
  1114: { key: "vitamin_d" }, // µg D2+D3 (1110 IU is not convertible)
  1109: { key: "vitamin_e" }, // mg alpha-tocopherol
  1185: { key: "vitamin_k" }, // µg phylloquinone
  1165: { key: "thiamin" },
  1166: { key: "riboflavin" },
  1167: { key: "niacin" },
  1175: { key: "vitamin_b6" },
  1190: { key: "folate" }, // µg DFE
  1177: { key: "folate", priority: 1 }, // µg total folate
  1178: { key: "vitamin_b12" },
  1057: { key: "caffeine" },
  1018: { key: "alcohol" },
  1051: { key: "water" },
};

const MASS_IN_G: Record<NutrientUnit, number> = { g: 1, mg: 1e-3, ug: 1e-6 };

/** Fold µ (U+00B5) / μ (U+03BC) to "u" and lowercase: "µg"→"ug", "MG"→"mg". */
function normalizeUnit(unitName: string | undefined): NutrientUnit | null {
  if (!unitName) return null;
  const folded = unitName.replace(/[µμ]/g, "u").trim().toLowerCase();
  if (folded === "g") return "g";
  if (folded === "mg") return "mg";
  if (folded === "ug" || folded === "mcg") return "ug";
  return null;
}

/** null ⇒ unconvertible (IU, kJ, "sp gr", missing unit) — drop the value. */
function convertToCanonical(
  amount: number,
  unitName: string | undefined,
  target: NutrientUnit,
): number | null {
  const from = normalizeUnit(unitName);
  if (from === null) return null;
  return (amount * MASS_IN_G[from]) / MASS_IN_G[target];
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

type NutrientValue = { value: number; unitName?: string; name?: string };

/** Trim a trailing-zero-free quantity for portion labels ("0.25", "2"). */
function formatQuantity(value: number): string {
  return String(roundTo(value, 3));
}

export function mapUsdaFood(raw: unknown): UsdaMapResult {
  const parsedFood = usdaFoodSchema.safeParse(raw);
  if (!parsedFood.success) {
    return {
      ok: false,
      reason: "invalid_shape",
      detail: z.prettifyError(parsedFood.error),
    };
  }
  const food = parsedFood.data;

  // Parity skips (mirror the hand-pruned catalog) before any nutrient work.
  const categoryDescription =
    typeof food.foodCategory === "string"
      ? food.foodCategory.trim()
      : food.foodCategory?.description?.trim();
  if (categoryDescription && EXCLUDED_CATEGORIES.has(categoryDescription)) {
    return {
      ok: false,
      reason: "excluded_category",
      detail: `${categoryDescription}: ${food.description}`,
    };
  }
  let name = cleanFoodName(food.description);
  if (hasBrandToken(name)) {
    return { ok: false, reason: "brand_name", detail: name };
  }

  const warnings: string[] = [];
  const unknownNutrients: UnknownNutrient[] = [];

  // First occurrence per nutrient id wins; value = amount ?? median
  // (Foundation analytical entries sometimes carry only a median).
  const byId = new Map<number, NutrientValue>();
  for (const entry of food.foodNutrients ?? []) {
    const parsed = usdaNutrientSchema.safeParse(entry);
    if (!parsed.success) continue;
    const id = parsed.data.nutrient?.id;
    const value = parsed.data.amount ?? parsed.data.median;
    if (id === undefined || value === undefined) continue;
    if (!byId.has(id)) {
      byId.set(id, {
        value,
        unitName: parsed.data.nutrient?.unitName,
        name: parsed.data.nutrient?.name,
      });
    }
  }

  // Energy — must be kcal.
  let energyKcal: number | null = null;
  for (const id of ENERGY_IDS) {
    const hit = byId.get(id);
    if (hit && hit.unitName?.trim().toLowerCase() === "kcal") {
      energyKcal = hit.value;
      if (id !== 1008) warnings.push(`energy taken from fallback id ${id}`);
      break;
    }
  }
  if (energyKcal === null) {
    const seen = [...ENERGY_IDS, KJ_ENERGY_ID]
      .filter((id) => byId.has(id))
      .map((id) => `${id} (${byId.get(id)?.unitName ?? "?"})`);
    return {
      ok: false,
      reason: "no_energy",
      detail: `no kcal energy nutrient (1008/2047/2048); saw: ${
        seen.length > 0 ? seen.join(", ") : "none"
      }`,
    };
  }

  // Macros — converted to grams via unitName, never assumed.
  const macroGrams = (ids: number[]): number | null => {
    for (const id of ids) {
      const hit = byId.get(id);
      if (!hit) continue;
      const grams = convertToCanonical(hit.value, hit.unitName, "g");
      if (grams !== null) return grams;
    }
    return null;
  };
  // FDC "by difference" macros can come out slightly negative on zero-carb
  // foods (raw meat/fish) — clamp rather than fail validation's min(0).
  const clampMacro = (value: number | null, label: string): number | null => {
    if (value === null || value >= 0) return value;
    warnings.push(`${label} clamped to 0 (was ${roundTo(value, 2)})`);
    return 0;
  };
  const proteinG = clampMacro(macroGrams([PROTEIN_ID]), "protein");
  const fatG = clampMacro(macroGrams([FAT_ID]), "fat");
  const carbsG = clampMacro(macroGrams(CARB_IDS), "carbs");
  if (proteinG === null || fatG === null || carbsG === null) {
    const missing = [
      proteinG === null ? "protein (1003)" : null,
      fatG === null ? "fat (1004)" : null,
      carbsG === null ? "carbs (1005/1050)" : null,
    ].filter(Boolean);
    return {
      ok: false,
      reason: "missing_macros",
      detail: `missing or unconvertible: ${missing.join(", ")}`,
    };
  }

  // Micronutrients via the declarative table.
  const nutrients: NutrientMap = {};
  const chosenPriority: Partial<Record<NutrientKey, number>> = {};
  for (const [id, hit] of byId) {
    if (MACRO_AND_ENERGY_IDS.has(id)) continue;
    const mapping = FDC_NUTRIENT_MAP[id];
    if (!mapping) {
      unknownNutrients.push({
        id,
        name: hit.name ?? "",
        unitName: hit.unitName ?? "",
      });
      continue;
    }
    const priority = mapping.priority ?? 0;
    const current = chosenPriority[mapping.key];
    if (current !== undefined && current <= priority) continue;
    const converted = convertToCanonical(
      hit.value,
      hit.unitName,
      NUTRIENTS[mapping.key].unit,
    );
    if (converted === null) {
      warnings.push(
        `dropped ${hit.name ?? mapping.key} (id ${id}): unsupported unit "${hit.unitName ?? ""}"`,
      );
      continue;
    }
    if (converted < 0) {
      warnings.push(`dropped ${mapping.key} (id ${id}): negative value`);
      continue;
    }
    nutrients[mapping.key] = roundTo(converted, 4);
    chosenPriority[mapping.key] = priority;
  }

  // Portions: label from portionDescription or amount + measureUnit/modifier.
  const portions: {
    label: string;
    quantity: number;
    amountInBase: number;
    isDefault: boolean;
  }[] = [];
  for (const entry of food.foodPortions ?? []) {
    if (portions.length >= 20) break;
    const parsed = usdaPortionSchema.safeParse(entry);
    if (!parsed.success) continue;
    const p = parsed.data;
    if (p.gramWeight === undefined || p.gramWeight <= 0) continue;
    const desc = p.portionDescription?.trim();
    if (desc?.toLowerCase() === "quantity not specified") continue;
    const quantity = p.amount !== undefined && p.amount > 0 ? p.amount : 1;
    let label: string;
    if (desc) {
      label = desc;
    } else {
      // SR Legacy uses measureUnit.name "undetermined" with the real text in
      // modifier; Foundation uses real measure units with an empty modifier.
      const unitName = p.measureUnit?.name?.trim();
      const unitText =
        unitName && unitName.toLowerCase() !== "undetermined"
          ? (p.measureUnit?.abbreviation?.trim() ?? unitName)
          : undefined;
      const modifier = p.modifier?.trim();
      const parts = [unitText, modifier].filter(Boolean).join(", ");
      if (!parts) continue;
      label = `${formatQuantity(quantity)} ${parts}`;
    }
    portions.push({
      label: cleanPortionLabel(label).slice(0, 100).trim(),
      quantity: roundTo(quantity, 3),
      amountInBase: roundTo(p.gramWeight, 3),
      isDefault: false,
    });
  }

  if (name.length > 200) {
    warnings.push(`name truncated to 200 chars`);
    name = name.slice(0, 200).trim();
  }

  const validated = createFoodSchema.safeParse({
    name,
    description: categoryDescription || undefined,
    baseUnit: "g",
    servingSize: 100,
    energyKcal: roundTo(energyKcal, 2),
    proteinG: roundTo(proteinG, 2),
    carbsG: roundTo(carbsG, 2),
    fatG: roundTo(fatG, 2),
    nutrients,
    visibility: "public",
    portions,
  });
  if (!validated.success) {
    return {
      ok: false,
      reason: "validation_failed",
      detail: z.prettifyError(validated.error),
    };
  }

  return {
    ok: true,
    fdcId: food.fdcId,
    sourceRef: `fdc:${food.fdcId}`,
    input: validated.data,
    popularity: computePopularity(validated.data.name),
    warnings,
    unknownNutrients,
  };
}
