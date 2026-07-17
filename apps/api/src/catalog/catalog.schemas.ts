import { nutrientMapSchema } from "@metabolizm/shared";
import { z } from "zod";

// Numeric caps mirror the DB column types (numeric(8,2) / numeric(8,3) /
// numeric(10,3)) so out-of-range values 400 here instead of 500 in Postgres.

export const createFoodPortionSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(1).max(100),
  quantity: z.number().positive().max(99_999).default(1),
  amountInBase: z.number().positive().max(9_999_999),
  isDefault: z.boolean().default(false),
});

export const createFoodSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  barcode: z.string().trim().min(1).max(64).optional(),
  baseUnit: z.enum(["g", "ml"]).default("g"),
  servingSize: z.number().positive().max(999_999).default(100),
  servingLabel: z.string().trim().min(1).max(100).optional(),
  energyKcal: z.number().min(0).max(999_999),
  proteinG: z.number().min(0).max(999_999),
  carbsG: z.number().min(0).max(999_999),
  fatG: z.number().min(0).max(999_999),
  nutrients: nutrientMapSchema.default({}),
  visibility: z.enum(["private", "public"]).default("private"),
  portions: z
    .array(createFoodPortionSchema)
    .max(20)
    .default([])
    .refine((portions) => portions.filter((p) => p.isDefault).length <= 1, {
      message: "At most one portion may have isDefault=true",
    }),
});

export type CreateFoodInput = z.output<typeof createFoodSchema>;

// Written out instead of createFoodSchema.partial(): partial() keeps the zod
// defaults, so PATCH {} would silently reset baseUnit/visibility/servingSize.
export const updateFoodSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    brand: z.string().trim().min(1).max(200).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    barcode: z.string().trim().min(1).max(64).nullable().optional(),
    baseUnit: z.enum(["g", "ml"]).optional(),
    servingSize: z.number().positive().max(999_999).optional(),
    servingLabel: z.string().trim().min(1).max(100).nullable().optional(),
    energyKcal: z.number().min(0).max(999_999).optional(),
    proteinG: z.number().min(0).max(999_999).optional(),
    carbsG: z.number().min(0).max(999_999).optional(),
    fatG: z.number().min(0).max(999_999).optional(),
    nutrients: nutrientMapSchema.optional(),
    visibility: z.enum(["private", "public"]).optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: "Patch must set at least one field",
  });

export type UpdateFoodInput = z.output<typeof updateFoodSchema>;

export const listFoodsQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(512).optional(),
});

export type ListFoodsQuery = z.output<typeof listFoodsQuerySchema>;

export const foodIdParamSchema = z.uuid();
