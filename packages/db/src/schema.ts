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

// Auth tables follow Better Auth's core model; TS property names must equal
// Better Auth's field names (and export names its pluralized model names) so
// the drizzle adapter needs no model/field mapping.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    uniqueIndex("sessions_token_uq").on(t.token),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Provider-side user id ("credential" accounts reuse the user id).
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    uniqueIndex("accounts_provider_account_uq").on(t.providerId, t.accountId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

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
