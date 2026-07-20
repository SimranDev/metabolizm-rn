import type { GroupShareConfig, NutrientMap } from "@metabolizm/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
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
  // IANA timezone name; drives each member's "today" in group reads.
  timezone: text("timezone").notNull().default("UTC"),
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

export const mealEnum = pgEnum("meal", [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
]);

// Food diary. Rows are denormalized snapshots taken at log time — editing or
// deleting a catalog food must never change logged history; food_id is only a
// "reopen and edit" reference. Unlike foods, macro/nutrient values here are
// the consumed amounts for the logged quantity, NOT per 100 base units.
export const diaryEntries = pgTable(
  "diary_entries",
  {
    // App generates UUIDv7 client-side (local id == server id, so pushes are
    // idempotent upserts); gen_random_uuid() is only a fallback.
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Client-local calendar day (the store's todayKey()), never derived
    // server-side from a timestamp — that's the classic timezone bug.
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    meal: mealEnum("meal").notNull(),
    foodId: uuid("food_id").references(() => foods.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    servingLabel: text("serving_label").notNull(),
    quantity: numeric("quantity", { precision: 8, scale: 3, mode: "number" }),
    unitLabel: text("unit_label"),
    // Grams or ml (the food's base_unit) one logged unit equals.
    unitAmountInBase: numeric("unit_amount_in_base", {
      precision: 10,
      scale: 3,
      mode: "number",
    }),
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
    verified: boolean("verified").notNull().default(false),
    // Client-supplied creation moment; orders entries within a meal. The
    // default only covers rows not written through the api.
    loggedAt: timestamp("logged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    index("diary_entries_user_date_idx")
      .on(t.userId, t.entryDate)
      .where(sql`deleted_at IS NULL`),
    // Keyset delta pulls: (updated_at, id) > cursor scoped to the user.
    index("diary_entries_user_updated_idx").on(t.userId, t.updatedAt, t.id),
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

export const groupCategoryEnum = pgEnum("group_category", [
  "partner",
  "family",
  "friends",
  "trainer",
]);
export const groupRoleEnum = pgEnum("group_role", [
  "owner",
  "admin",
  "member",
  "coach",
]);
export const groupMemberStatusEnum = pgEnum("group_member_status", [
  "invited",
  "active",
  "left",
  "removed",
]);
export const groupInteractionKindEnum = pgEnum("group_interaction_kind", [
  "comment",
  "reaction",
]);

// Private accountability circles (≤ ~50 people). Invite-only; no discovery,
// no follower graph, no feed table — group feeds are computed at read time.
export const groups = pgTable(
  "groups",
  {
    // App generates UUIDv7; gen_random_uuid() is only a fallback.
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    category: groupCategoryEnum("category").notNull(),
    // Restrict: an owner must transfer or delete their groups before their
    // account can be deleted — never orphan a group silently.
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("groups_owner_id_idx").on(t.ownerId)],
);

export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: groupRoleEnum("role").notNull().default("member"),
    status: groupMemberStatusEnum("status").notNull().default("active"),
    // Partial config; readers normalize through groupShareConfigSchema, whose
    // all-false defaults mean a missing key can only under-share.
    shareConfig: jsonb("share_config")
      .$type<Partial<GroupShareConfig>>()
      .notNull()
      .default({}),
    // Read-marker for unread counts, bumped by the client.
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [
    // One live membership per (group, user); left/removed rows stay as
    // history and don't block a re-join.
    uniqueIndex("group_members_group_user_current_uq")
      .on(t.groupId, t.userId)
      .where(sql`status IN ('invited', 'active')`),
    index("group_members_user_id_idx").on(t.userId),
  ],
);

export const groupInvites = pgTable(
  "group_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Short URL-safe secret for the invite link/QR.
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    maxUses: integer("max_uses"),
    useCount: integer("use_count").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("group_invites_token_uq").on(t.token),
    index("group_invites_group_id_idx").on(t.groupId),
  ],
);

// One row per (user, local calendar day), recomputed from diary_entries in
// the same transaction as every diary write. Group feeds/leaderboards read
// ONLY these rows (plus diary_entries when mealDetail is shared).
export const dailySummaries = pgTable(
  "daily_summaries",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    energyKcal: numeric("energy_kcal", {
      precision: 10,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),
    proteinG: numeric("protein_g", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    carbsG: numeric("carbs_g", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    fatG: numeric("fat_g", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    // Distinct meal slots (breakfast/lunch/…) with at least one entry.
    mealsLogged: integer("meals_logged").notNull().default(0),
    mealNames: jsonb("meal_names").$type<string[]>().notNull().default([]),
    // Targets snapshotted at recompute time from the user_targets row
    // effective FOR entry_date — later target changes never rewrite past
    // adherence.
    targetKcal: numeric("target_kcal", {
      precision: 8,
      scale: 2,
      mode: "number",
    }),
    targetProteinG: numeric("target_protein_g", {
      precision: 8,
      scale: 2,
      mode: "number",
    }),
    targetCarbsG: numeric("target_carbs_g", {
      precision: 8,
      scale: 2,
      mode: "number",
    }),
    targetFatG: numeric("target_fat_g", {
      precision: 8,
      scale: 2,
      mode: "number",
    }),
    // Written by a future weight-log path; diary recompute leaves it alone.
    weightKg: numeric("weight_kg", { precision: 6, scale: 2, mode: "number" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entryDate] })],
);

// Append-only target history. Current target for a day = latest row with
// effective_from <= that day.
export const userTargets = pgTable(
  "user_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
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
    // Self, or the coach who wrote it; set null so deleting the coach's
    // account never touches the client's target history.
    setBy: uuid("set_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("user_targets_user_effective_idx").on(t.userId, t.effectiveFrom)],
);

// Comments/reactions on a member's day card. subject_date is the subject's
// local calendar day (matches daily_summaries.entry_date).
export const groupInteractions = pgTable(
  "group_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectUserId: uuid("subject_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectDate: date("subject_date", { mode: "string" }).notNull(),
    kind: groupInteractionKindEnum("kind").notNull(),
    body: text("body"),
    emoji: text("emoji"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("group_interactions_subject_idx").on(
      t.groupId,
      t.subjectUserId,
      t.subjectDate,
    ),
    // Backs the reaction toggle: one live reaction per author/emoji/day-card.
    uniqueIndex("group_interactions_reaction_uq")
      .on(t.groupId, t.authorId, t.subjectUserId, t.subjectDate, t.emoji)
      .where(sql`kind = 'reaction' AND deleted_at IS NULL`),
  ],
);
