/**
 * Food catalog API contract shared between apps/api and apps/mobile.
 * All macro/nutrient values are PER 100 base units (g or ml) — never per
 * serving; portion math happens at display time.
 */
import type { NutrientMap } from "./nutrients";

export type FoodSource = "system" | "custom";

export type FoodBaseUnit = "g" | "ml";

export type FoodVisibility = "private" | "public";

export type FoodPortionDto = {
  id: string;
  /** e.g. "1 medium", "1 katori" */
  label: string;
  quantity: number;
  /** Grams or ml (the food's baseUnit) this portion equals. */
  amountInBase: number;
  isDefault: boolean;
};

export type FoodDto = {
  id: string;
  /** null = system catalog food. */
  ownerId: string | null;
  name: string;
  brand: string | null;
  description: string | null;
  barcode: string | null;
  /** Provenance of imported system rows (e.g. "fdc:2262074"); read-only, null for user foods. */
  sourceRef: string | null;
  source: FoodSource;
  baseUnit: FoodBaseUnit;
  servingSize: number;
  servingLabel: string | null;
  /** Per 100 baseUnit. */
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  nutrients: NutrientMap;
  visibility: FoodVisibility;
  isVerified: boolean;
  popularity: number;
  forkedFrom: string | null;
  version: number;
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
  portions: FoodPortionDto[];
};

/** Search result row — deliberately excludes the nutrients map. */
export type FoodListItemDto = {
  id: string;
  name: string;
  brand: string | null;
  source: FoodSource;
  baseUnit: FoodBaseUnit;
  servingSize: number;
  servingLabel: string | null;
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isVerified: boolean;
  /** True when the row belongs to the caller. */
  isOwned: boolean;
  defaultPortion: { id: string; label: string; amountInBase: number } | null;
};

export type FoodSearchResponse = {
  items: FoodListItemDto[];
  /** Opaque cursor for the next page, or null when exhausted. */
  nextCursor: string | null;
};

export type CreateFoodPortionRequest = {
  /** Optional client-generated UUID (offline-first). */
  id?: string;
  label: string;
  quantity?: number;
  amountInBase: number;
  isDefault?: boolean;
};

export type CreateFoodRequest = {
  /** Optional client-generated UUIDv7 (offline-first). */
  id?: string;
  name: string;
  brand?: string;
  description?: string;
  barcode?: string;
  baseUnit?: FoodBaseUnit;
  servingSize?: number;
  servingLabel?: string;
  /** Per 100 baseUnit. */
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  nutrients?: NutrientMap;
  visibility?: FoodVisibility;
  portions?: CreateFoodPortionRequest[];
};

/**
 * PATCH body — all fields optional; text fields accept null to clear.
 * Portions are create-only for now. source/isVerified/popularity are
 * server-controlled and never accepted from clients.
 */
export type UpdateFoodRequest = {
  name?: string;
  brand?: string | null;
  description?: string | null;
  barcode?: string | null;
  baseUnit?: FoodBaseUnit;
  servingSize?: number;
  servingLabel?: string | null;
  energyKcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  nutrients?: NutrientMap;
  visibility?: FoodVisibility;
};
