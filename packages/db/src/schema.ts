import type { NutrientMap } from "@metabolizm/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const foodSourceEnum = pgEnum("food_source", ["system", "custom"]);
export const baseUnitEnum = pgEnum("base_unit", ["g", "ml"]);
export const visibilityEnum = pgEnum("visibility", ["private", "public"]);

// All macro/nutrient values are per 100 base units (g or ml), never per serving.
export const foods = pgTable(
  "foods",
  {
    // App generates UUIDv7; gen_random_uuid() is only a fallback.
    id: uuid("id").primaryKey().defaultRandom(),
    // NULL = system catalog food, visible to everyone.
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    brand: text("brand"),
    description: text("description"),
    barcode: text("barcode"),
    // Provenance of imported system rows, e.g. "fdc:2262074"; null for user foods.
    sourceRef: text("source_ref"),
    source: foodSourceEnum("source").notNull().default("custom"),
    baseUnit: baseUnitEnum("base_unit").notNull().default("g"),
    servingSize: numeric("serving_size", {
      precision: 8,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(100),
    servingLabel: text("serving_label"),
    energyKcal: numeric("energy_kcal", {
      precision: 8,
      scale: 2,
      mode: "number",
    }).notNull(),
    proteinG: numeric("protein_g", {
      precision: 8,
      scale: 2,
      mode: "number",
    }).notNull(),
    carbsG: numeric("carbs_g", {
      precision: 8,
      scale: 2,
      mode: "number",
    }).notNull(),
    fatG: numeric("fat_g", {
      precision: 8,
      scale: 2,
      mode: "number",
    }).notNull(),
    nutrients: jsonb("nutrients").$type<NutrientMap>().notNull().default({}),
    visibility: visibilityEnum("visibility").notNull().default("private"),
    isVerified: boolean("is_verified").notNull().default(false),
    popularity: integer("popularity").notNull().default(0),
    forkedFrom: uuid("forked_from").references((): AnyPgColumn => foods.id, {
      onDelete: "set null",
    }),
    // Bumped on every update, for future sync.
    version: bigint("version", { mode: "number" }).notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("foods_owner_id_idx").on(t.ownerId),
    // Backs ILIKE '%q%' search; needs the pg_trgm extension (created in the
    // migration — drizzle-kit does not emit CREATE EXTENSION).
    index("foods_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
    uniqueIndex("foods_barcode_active_uq")
      .on(t.barcode)
      .where(sql`barcode IS NOT NULL AND deleted_at IS NULL`),
    uniqueIndex("foods_source_ref_active_uq")
      .on(t.sourceRef)
      .where(sql`source_ref IS NOT NULL AND deleted_at IS NULL`),
  ],
);

export const foodPortions = pgTable(
  "food_portions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    quantity: numeric("quantity", { precision: 8, scale: 3, mode: "number" })
      .notNull()
      .default(1),
    // Grams or ml (the food's base_unit) this portion equals.
    amountInBase: numeric("amount_in_base", {
      precision: 10,
      scale: 3,
      mode: "number",
    }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => [index("food_portions_food_id_idx").on(t.foodId)],
);
