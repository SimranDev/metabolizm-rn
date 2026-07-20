/**
 * Groups request validation + share-config model, shared by apps/api and the
 * mobile app (consent screen renders the same defaults the server applies).
 */
import { z } from "zod";

import { entryDateSchema } from "./diary-schemas";

export const groupCategorySchema = z.enum([
  "partner",
  "family",
  "friends",
  "trainer",
]);
export type GroupCategory = z.output<typeof groupCategorySchema>;

export const groupRoleSchema = z.enum(["owner", "admin", "member", "coach"]);
export type GroupRole = z.output<typeof groupRoleSchema>;

export const groupMemberStatusSchema = z.enum([
  "invited",
  "active",
  "left",
  "removed",
]);
export type GroupMemberStatus = z.output<typeof groupMemberStatusSchema>;

export const groupInteractionKindSchema = z.enum(["comment", "reaction"]);
export type GroupInteractionKind = z.output<typeof groupInteractionKindSchema>;

/**
 * What a member exposes to one group. `adherenceOnly` overrides the numeric
 * toggles: the group sees hit/missed booleans computed server-side, never
 * absolute kcal/gram/weight numbers.
 */
const shareToggles = z.object({
  adherenceOnly: z.boolean(),
  calories: z.boolean(),
  macros: z.boolean(),
  mealNames: z.boolean(),
  mealDetail: z.boolean(),
  weightTrend: z.boolean(),
  streaks: z.boolean(),
});

export type GroupShareConfig = z.output<typeof shareToggles>;

export const SHARE_NOTHING: GroupShareConfig = {
  adherenceOnly: false,
  calories: false,
  macros: false,
  mealNames: false,
  mealDetail: false,
  weightTrend: false,
  streaks: false,
};

/**
 * A partial update — only the toggles the caller names. Deliberately has NO
 * per-field defaults: a schema with defaults would materialize every absent
 * toggle as `false` and silently switch off everything the caller didn't
 * mention.
 */
export const groupSharePatchSchema = shareToggles.partial();
export type GroupShareConfigPatch = z.output<typeof groupSharePatchSchema>;

/**
 * A complete config, normalizing whatever was stored: absent keys read as
 * OFF, so a partial or malformed stored blob can only ever under-share.
 */
export const groupShareConfigSchema = groupSharePatchSchema.transform(
  (patch): GroupShareConfig => ({ ...SHARE_NOTHING, ...patch }),
);

/**
 * Default share toggles applied at join time, per category. The joiner sees
 * these on the consent screen and may override before accepting; they can be
 * edited anytime after. For trainer groups these are the CLIENT defaults —
 * the coach side shares nothing (see shareDefaultsFor).
 */
export const CATEGORY_SHARE_DEFAULTS: Record<GroupCategory, GroupShareConfig> =
  {
    partner: {
      adherenceOnly: false,
      calories: true,
      macros: true,
      mealNames: true,
      mealDetail: true,
      weightTrend: true,
      streaks: true,
    },
    family: {
      adherenceOnly: false,
      calories: true,
      macros: false,
      mealNames: true,
      mealDetail: false,
      weightTrend: false,
      streaks: true,
    },
    friends: {
      adherenceOnly: false,
      calories: false,
      macros: true,
      mealNames: false,
      mealDetail: false,
      weightTrend: false,
      streaks: true,
    },
    trainer: {
      adherenceOnly: false,
      calories: true,
      macros: true,
      mealNames: true,
      mealDetail: true,
      weightTrend: true,
      streaks: true,
    },
  };

/** Trainer-group coaches observe; they expose nothing to the group. */
export const COACH_SHARE_DEFAULTS: GroupShareConfig = SHARE_NOTHING;

export function shareDefaultsFor(
  category: GroupCategory,
  role: GroupRole,
): GroupShareConfig {
  if (category === "trainer" && (role === "coach" || role === "owner")) {
    return COACH_SHARE_DEFAULTS;
  }
  return CATEGORY_SHARE_DEFAULTS[category];
}

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: groupCategorySchema,
});
export type CreateGroupInput = z.output<typeof createGroupSchema>;

export const createGroupInviteSchema = z.object({
  /** Invite lifetime in hours; default one week, max 30 days. */
  ttlHours: z.number().int().min(1).max(720).default(168),
  maxUses: z.number().int().min(1).max(500).nullable().default(null),
});
export type CreateGroupInviteInput = z.output<typeof createGroupInviteSchema>;

export const acceptGroupInviteSchema = z.object({
  /** Overrides merged onto the category defaults shown on the consent screen. */
  shareConfig: groupSharePatchSchema.optional(),
});
export type AcceptGroupInviteInput = z.output<typeof acceptGroupInviteSchema>;

export const updateMyMembershipSchema = z
  .object({
    /** Partial; merged onto the current config. Takes effect immediately for all past and future days. */
    shareConfig: groupSharePatchSchema.optional(),
    /** Marks the group as read up to this moment (drives unread counts). */
    lastSeenAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((v) => v.shareConfig !== undefined || v.lastSeenAt !== undefined, {
    message: "Provide shareConfig and/or lastSeenAt",
  });
export type UpdateMyMembershipInput = z.output<typeof updateMyMembershipSchema>;

export const groupFeedQuerySchema = z.object({
  /**
   * Calendar day to show; omit for "today", which is each member's own
   * current local date per their profile timezone, not one global date.
   */
  date: entryDateSchema.optional(),
});
export type GroupFeedQuery = z.output<typeof groupFeedQuerySchema>;

export const groupLeaderboardQuerySchema = z.object({
  /** Any date inside the wanted week (normalized to Mon–Sun); omit for the current week. */
  week: entryDateSchema.optional(),
});
export type GroupLeaderboardQuery = z.output<typeof groupLeaderboardQuerySchema>;

export const createGroupInteractionSchema = z
  .object({
    subjectUserId: z.uuid(),
    subjectDate: entryDateSchema,
    kind: groupInteractionKindSchema,
    body: z.string().trim().min(1).max(1000).optional(),
    /** Reactions toggle: posting the same emoji again removes it. */
    emoji: z.string().trim().min(1).max(16).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "comment" && v.body === undefined) {
      ctx.addIssue({ code: "custom", message: "Comments require body" });
    }
    if (v.kind === "reaction" && v.emoji === undefined) {
      ctx.addIssue({ code: "custom", message: "Reactions require emoji" });
    }
  });
export type CreateGroupInteractionInput = z.output<
  typeof createGroupInteractionSchema
>;

export const putMemberTargetsSchema = z.object({
  effectiveFrom: entryDateSchema,
  energyKcal: z.number().min(0).max(99_999),
  proteinG: z.number().min(0).max(9_999),
  carbsG: z.number().min(0).max(9_999),
  fatG: z.number().min(0).max(9_999),
});
export type PutMemberTargetsInput = z.output<typeof putMemberTargetsSchema>;

export const transferOwnershipSchema = z.object({
  userId: z.uuid(),
});
export type TransferOwnershipInput = z.output<typeof transferOwnershipSchema>;
