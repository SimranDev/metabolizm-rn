/**
 * Groups wire contracts — response DTOs for /v1/groups.
 *
 * Masking model: every shareable field on a member's card/day is OPTIONAL and
 * simply ABSENT (not null) when that member's share config withholds it. The
 * `shared` map mirrors the member's effective config so clients can render
 * locked chips for what's hidden. Masking is applied server-side before
 * serialization — an absent field was never in the payload.
 */

import type { MealId } from "./diary";
import type {
  GroupCategory,
  GroupMemberStatus,
  GroupRole,
  GroupShareConfig,
} from "./groups-schemas";

export type GroupDto = {
  id: string;
  name: string;
  category: GroupCategory;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type GroupMembershipDto = {
  id: string;
  groupId: string;
  userId: string;
  role: GroupRole;
  status: GroupMemberStatus;
  shareConfig: GroupShareConfig;
  lastSeenAt: string | null;
  joinedAt: string;
  leftAt: string | null;
};

export type CreateGroupResponse = {
  group: GroupDto;
  membership: GroupMembershipDto;
};

export type GroupMemberAvatarDto = {
  userId: string;
  name: string;
  image: string | null;
};

export type GroupListItemDto = {
  id: string;
  name: string;
  category: GroupCategory;
  role: GroupRole;
  memberCount: number;
  /** First few active members, for the avatar stack. */
  members: GroupMemberAvatarDto[];
  myStreak: number;
  /** Interactions + member summaries newer than my lastSeenAt. */
  unreadCount: number;
};

export type GroupsListResponse = { groups: GroupListItemDto[] };

export type GroupInviteDto = {
  id: string;
  groupId: string;
  token: string;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
  createdAt: string;
};

export type CreateGroupInviteResponse = { invite: GroupInviteDto };

/** Consent screen: what the joiner is about to share, before accepting. */
export type GroupInvitePreviewResponse = {
  group: { name: string; category: GroupCategory; memberCount: number };
  shareDefaults: GroupShareConfig;
};

export type AcceptGroupInviteResponse = {
  group: GroupDto;
  membership: GroupMembershipDto;
};

export type UpdateMyMembershipResponse = { membership: GroupMembershipDto };

/**
 * Hit/missed vs the member's snapshotted targets, computed server-side.
 * `null` = no target was set for that day; absolute numbers never appear.
 */
export type GroupAdherenceFlags = {
  logged: boolean;
  caloriesInRange: boolean | null;
  proteinHit: boolean | null;
  carbsInRange: boolean | null;
  fatInRange: boolean | null;
};

/**
 * One member's day in the group feed. Optional fields are present only when
 * that member's share config exposes them (see the module docblock).
 */
export type GroupMemberDayCardDto = {
  userId: string;
  name: string;
  image: string | null;
  /** The member's own local calendar day this card describes. */
  date: string;
  /** The member's effective share config — render locked chips from this. */
  shared: GroupShareConfig;
  /** Whether the member logged anything that day; the always-visible floor. */
  logged: boolean;
  calories?: { consumedKcal: number; targetKcal: number | null };
  macros?: {
    proteinG: number;
    carbsG: number;
    fatG: number;
    targetProteinG: number | null;
    targetCarbsG: number | null;
    targetFatG: number | null;
  };
  mealNames?: string[];
  mealsLogged?: number;
  /** Present instead of numeric fields when adherenceOnly is on. */
  adherence?: GroupAdherenceFlags;
  /** Direction only under adherenceOnly; deltaKg included otherwise. */
  weightTrend?: { direction: "up" | "down" | "flat" | null; deltaKg?: number | null };
  streak?: number;
  comments: GroupCommentDto[];
  reactions: GroupReactionDto[];
};

export type GroupFeedResponse = { cards: GroupMemberDayCardDto[] };

/**
 * A diary entry as exposed to a group — only when the member shares
 * mealDetail. Per-entry numbers additionally require the matching toggle and
 * are absent entirely under adherenceOnly.
 */
export type MaskedDiaryEntryDto = {
  id: string;
  meal: MealId;
  name: string;
  loggedAt: string;
  servingLabel?: string;
  quantity?: number | null;
  unitLabel?: string | null;
  energyKcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
};

export type GroupMemberDayResponse = {
  card: GroupMemberDayCardDto;
  /** Only present when the member shares mealDetail. */
  entries?: MaskedDiaryEntryDto[];
};

/**
 * Weekly consistency ranking. Ranked by adherence % then logging streak —
 * never by raw calories or weight, which don't appear here at all.
 */
export type GroupLeaderboardEntryDto = {
  rank: number;
  userId: string;
  name: string;
  image: string | null;
  /** Days logged within the week — derived from the always-visible logged flag. */
  daysLogged: number;
  /** Null when the member shares no adherence-related data. */
  adherencePct: number | null;
  /** Absent when the member's streaks toggle is off. */
  streak?: number;
};

export type GroupLeaderboardResponse = {
  weekStart: string;
  weekEnd: string;
  entries: GroupLeaderboardEntryDto[];
};

export type GroupRosterDayDto = {
  date: string;
  logged: boolean;
  /** Null when no target was set (or client shares no adherence data). */
  adherent: boolean | null;
};

export type GroupRosterClientDto = {
  userId: string;
  name: string;
  image: string | null;
  bucket: "on-track" | "slipping" | "off-track";
  adherence7dPct: number | null;
  /** Trailing 7 days, oldest first, in the client's own timezone. */
  days: GroupRosterDayDto[];
};

export type GroupRosterResponse = { clients: GroupRosterClientDto[] };

export type GroupCommentDto = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type GroupReactionDto = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

/** POST /groups/:id/interactions — comment echo, or the reaction toggle result. */
export type CreateGroupInteractionResponse = {
  comment?: GroupCommentDto;
  reaction?: { emoji: string; reacted: boolean };
};

export type UserTargetDto = {
  id: string;
  userId: string;
  effectiveFrom: string;
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Who wrote the row — self, or the coach's user id. */
  setBy: string | null;
  createdAt: string;
};

export type PutMemberTargetsResponse = { target: UserTargetDto };
