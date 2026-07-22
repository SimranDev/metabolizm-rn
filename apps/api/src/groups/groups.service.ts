import {
  dailySummaries,
  groupInteractions,
  groupInvites,
  groupMembers,
  groups,
  userTargets,
  users,
} from "@metabolizm/db";
import {
  shareDefaultsFor,
  type AcceptGroupInviteInput,
  type AcceptGroupInviteResponse,
  type CreateGroupInput,
  type CreateGroupInteractionInput,
  type CreateGroupInteractionResponse,
  type CreateGroupInviteInput,
  type CreateGroupResponse,
  type GroupDto,
  type GroupInvitePreviewResponse,
  type GroupInviteDto,
  type GroupMembershipDto,
  type GroupShareConfig,
  type PutMemberTargetsInput,
  type PutMemberTargetsResponse,
  type TransferOwnershipInput,
  type UpdateMyMembershipInput,
} from "@metabolizm/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, count, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { isPgError } from "../common/pg-error";
import { DB, type Database } from "../db/db.module";
import { SummariesService, type DbExecutor } from "../summaries/summaries.service";
import { generateInviteToken, inviteRejection, joinRejection } from "./invite-token";
import { normalizeShareConfig } from "./masking";

export type GroupRow = typeof groups.$inferSelect;
export type MemberRow = typeof groupMembers.$inferSelect;
type InviteRow = typeof groupInvites.$inferSelect;

export function toGroupDto(row: GroupRow): GroupDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    ownerId: row.ownerId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMembershipDto(row: MemberRow): GroupMembershipDto {
  return {
    id: row.id,
    groupId: row.groupId,
    userId: row.userId,
    role: row.role,
    status: row.status,
    shareConfig: normalizeShareConfig(row.shareConfig),
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    joinedAt: row.joinedAt.toISOString(),
    leftAt: row.leftAt ? row.leftAt.toISOString() : null,
  };
}

function toInviteDto(row: InviteRow): GroupInviteDto {
  return {
    id: row.id,
    groupId: row.groupId,
    token: row.token,
    expiresAt: row.expiresAt.toISOString(),
    maxUses: row.maxUses,
    useCount: row.useCount,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The coach side of a trainer group: dedicated coach role, or its owner. */
export function isCoach(group: GroupRow, membership: MemberRow): boolean {
  return (
    group.category === "trainer" &&
    (membership.role === "coach" || membership.role === "owner")
  );
}

/** Seniority order for the heir picked when an owner deletes their account. */
const HEIR_RANK: Record<MemberRow["role"], number> = {
  owner: 0,
  admin: 1,
  coach: 2,
  member: 3,
};

/**
 * Who inherits a group whose owner is deleting their account: the most senior
 * active member, oldest membership breaking the tie. Null when nobody is left.
 */
function pickHeir(candidates: MemberRow[]): MemberRow | null {
  let heir: MemberRow | null = null;
  for (const candidate of candidates) {
    if (
      heir === null ||
      HEIR_RANK[candidate.role] < HEIR_RANK[heir.role] ||
      (HEIR_RANK[candidate.role] === HEIR_RANK[heir.role] &&
        candidate.joinedAt < heir.joinedAt)
    ) {
      heir = candidate;
    }
  }
  return heir;
}

@Injectable()
export class GroupsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly summaries: SummariesService,
  ) {}

  /**
   * The caller's live membership in a live group. Non-members, left/removed
   * members, and deleted/unknown groups all 404 identically — group
   * existence is never revealed to outsiders.
   */
  async requireMembership(
    groupId: string,
    userId: string,
    db: DbExecutor = this.db,
  ): Promise<{ group: GroupRow; membership: MemberRow }> {
    const [row] = await db
      .select({ group: groups, membership: groupMembers })
      .from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.status, "active"),
          isNull(groups.deletedAt),
        ),
      );
    if (!row) throw new NotFoundException("Group not found");
    return row;
  }

  async createGroup(
    userId: string,
    input: CreateGroupInput,
  ): Promise<CreateGroupResponse> {
    try {
      return await this.db.transaction(async (tx) => {
        const [group] = await tx
          .insert(groups)
          .values({
            id: uuidv7(),
            name: input.name,
            category: input.category,
            ownerId: userId,
          })
          .returning();
        const [membership] = await tx
          .insert(groupMembers)
          .values({
            id: uuidv7(),
            groupId: group.id,
            userId,
            role: "owner",
            shareConfig: shareDefaultsFor(input.category, "owner"),
          })
          .returning();
        return { group: toGroupDto(group), membership: toMembershipDto(membership) };
      });
    } catch (error) {
      // FK violation: the dev-header user doesn't exist.
      if (isPgError(error, "23503")) {
        throw new BadRequestException("Unknown user");
      }
      throw error;
    }
  }

  async deleteGroup(userId: string, groupId: string): Promise<void> {
    const { group } = await this.requireMembership(groupId, userId);
    if (group.ownerId !== userId) {
      throw new ForbiddenException("Only the owner can delete a group");
    }
    await this.db
      .update(groups)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(groups.id, groupId), isNull(groups.deletedAt)));
  }

  async leaveGroup(userId: string, groupId: string): Promise<void> {
    const { group, membership } = await this.requireMembership(groupId, userId);
    if (group.ownerId === userId) {
      throw new BadRequestException(
        "Transfer ownership or delete the group before leaving",
      );
    }
    await this.db
      .update(groupMembers)
      .set({ status: "left", leftAt: new Date() })
      .where(
        and(eq(groupMembers.id, membership.id), eq(groupMembers.status, "active")),
      );
  }

  async removeMember(
    callerId: string,
    groupId: string,
    targetUserId: string,
  ): Promise<void> {
    const { group, membership: caller } = await this.requireMembership(
      groupId,
      callerId,
    );
    if (targetUserId === callerId) {
      throw new BadRequestException("Use leave to remove yourself");
    }
    const canManage =
      caller.role === "owner" || caller.role === "admin" || isCoach(group, caller);
    if (!canManage) {
      throw new ForbiddenException("Only owners or admins can remove members");
    }
    const target = await this.activeMember(groupId, targetUserId);
    if (!target) throw new NotFoundException("Member not found");
    if (target.userId === group.ownerId) {
      throw new ForbiddenException("The owner cannot be removed");
    }
    // Admins/coaches can be removed only by the owner.
    if (target.role !== "member" && caller.role !== "owner") {
      throw new ForbiddenException("Only the owner can remove admins");
    }
    await this.db
      .update(groupMembers)
      .set({ status: "removed", leftAt: new Date() })
      .where(
        and(eq(groupMembers.id, target.id), eq(groupMembers.status, "active")),
      );
  }

  async transferOwnership(
    callerId: string,
    groupId: string,
    input: TransferOwnershipInput,
  ): Promise<{ group: GroupDto }> {
    const { group } = await this.requireMembership(groupId, callerId);
    if (group.ownerId !== callerId) {
      throw new ForbiddenException("Only the owner can transfer ownership");
    }
    if (input.userId === callerId) {
      throw new BadRequestException("Already the owner");
    }
    const target = await this.activeMember(groupId, input.userId);
    if (!target) throw new NotFoundException("Member not found");

    const updated = await this.db.transaction(async (tx) => {
      const [g] = await tx
        .update(groups)
        .set({ ownerId: input.userId, updatedAt: new Date() })
        .where(eq(groups.id, groupId))
        .returning();
      await tx
        .update(groupMembers)
        .set({ role: "owner" })
        .where(eq(groupMembers.id, target.id));
      // In trainer groups the outgoing owner keeps coach powers; elsewhere
      // they step down to admin.
      const [caller] = await tx
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, callerId),
            eq(groupMembers.status, "active"),
          ),
        );
      if (caller) {
        await tx
          .update(groupMembers)
          .set({ role: group.category === "trainer" ? "coach" : "admin" })
          .where(eq(groupMembers.id, caller.id));
      }
      return g;
    });
    return { group: toGroupDto(updated) };
  }

  /**
   * Hand off or tear down every group this user owns, so their account row can
   * be deleted. Called by `UsersService.deleteAccount` inside its transaction —
   * `groups.owner_id` is ON DELETE RESTRICT precisely so that a departing owner
   * can never silently orphan a group other people are still using.
   *
   * A group with other active members is transferred to the most senior of them
   * rather than deleted: the leaver's data disappears with their account, but
   * everyone else keeps the group, their own history, and each other. Only a
   * group nobody else is left in is destroyed — hard, not soft, because a
   * soft-deleted row still holds the FK that blocks the account delete.
   */
  async releaseOwnedGroups(tx: DbExecutor, userId: string): Promise<void> {
    const owned = await tx
      .select()
      .from(groups)
      .where(eq(groups.ownerId, userId));

    for (const group of owned) {
      // Already soft-deleted by its owner: nothing to hand over.
      const heir = group.deletedAt
        ? null
        : pickHeir(
            await tx
              .select()
              .from(groupMembers)
              .where(
                and(
                  eq(groupMembers.groupId, group.id),
                  eq(groupMembers.status, "active"),
                  ne(groupMembers.userId, userId),
                ),
              ),
          );

      if (!heir) {
        // Cascades to members, invites and interactions.
        await tx.delete(groups).where(eq(groups.id, group.id));
        continue;
      }

      await tx
        .update(groups)
        .set({ ownerId: heir.userId, updatedAt: new Date() })
        .where(eq(groups.id, group.id));
      await tx
        .update(groupMembers)
        .set({ role: "owner" })
        .where(eq(groupMembers.id, heir.id));
      // The leaver's own membership row goes with their user row (cascade), so
      // there is no outgoing-owner demotion to do here.
    }
  }

  async createInvite(
    callerId: string,
    groupId: string,
    input: CreateGroupInviteInput,
  ): Promise<{ invite: GroupInviteDto }> {
    const { group, membership } = await this.requireMembership(groupId, callerId);
    const allowed =
      membership.role === "owner" ||
      membership.role === "admin" ||
      isCoach(group, membership);
    if (!allowed) {
      throw new ForbiddenException("Only owners, admins, or coaches can invite");
    }
    const [invite] = await this.db
      .insert(groupInvites)
      .values({
        id: uuidv7(),
        groupId,
        createdBy: callerId,
        token: generateInviteToken(),
        expiresAt: new Date(Date.now() + input.ttlHours * 3_600_000),
        maxUses: input.maxUses,
      })
      .returning();
    return { invite: toInviteDto(invite) };
  }

  async revokeInvite(
    callerId: string,
    groupId: string,
    inviteId: string,
  ): Promise<void> {
    const { group, membership } = await this.requireMembership(groupId, callerId);
    const allowed =
      membership.role === "owner" ||
      membership.role === "admin" ||
      isCoach(group, membership);
    if (!allowed) {
      throw new ForbiddenException("Only owners, admins, or coaches can revoke");
    }
    await this.db
      .update(groupInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(groupInvites.id, inviteId),
          eq(groupInvites.groupId, groupId),
          isNull(groupInvites.revokedAt),
        ),
      );
  }

  /** Consent screen: what joining via this token means, before accepting. */
  async previewInvite(token: string): Promise<GroupInvitePreviewResponse> {
    const { group } = await this.loadLiveInvite(this.db, token);
    const [{ value: memberCount }] = await this.db
      .select({ value: count() })
      .from(groupMembers)
      .where(
        and(eq(groupMembers.groupId, group.id), eq(groupMembers.status, "active")),
      );
    return {
      group: {
        name: group.name,
        category: group.category,
        memberCount,
      },
      shareDefaults: shareDefaultsFor(group.category, "member"),
    };
  }

  async acceptInvite(
    userId: string,
    token: string,
    input: AcceptGroupInviteInput,
  ): Promise<AcceptGroupInviteResponse> {
    try {
      return await this.db.transaction(async (tx) => {
        // Lock the invite row so concurrent accepts serialize on use_count.
        const { invite, group } = await this.loadLiveInvite(tx, token, {
          forUpdate: true,
        });

        const activeMembers = await tx
          .select({ userId: groupMembers.userId })
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.groupId, group.id),
              eq(groupMembers.status, "active"),
            ),
          );
        if (activeMembers.some((m) => m.userId === userId)) {
          throw new ConflictException("Already a member of this group");
        }
        if (joinRejection(group.category, activeMembers.length) === "full") {
          throw new ConflictException("Partner groups are limited to 2 members");
        }

        const shareConfig: GroupShareConfig = {
          ...shareDefaultsFor(group.category, "member"),
          ...input.shareConfig,
        };
        const [membership] = await tx
          .insert(groupMembers)
          .values({
            id: uuidv7(),
            groupId: group.id,
            userId,
            role: "member",
            shareConfig,
          })
          .returning();
        await tx
          .update(groupInvites)
          .set({ useCount: sql`${groupInvites.useCount} + 1` })
          .where(eq(groupInvites.id, invite.id));
        return { group: toGroupDto(group), membership: toMembershipDto(membership) };
      });
    } catch (error) {
      // Unique-index race on (group, user): concurrent double-accept.
      if (isPgError(error, "23505")) {
        throw new ConflictException("Already a member of this group");
      }
      // FK violation: the dev-header user doesn't exist.
      if (isPgError(error, "23503")) {
        throw new BadRequestException("Unknown user");
      }
      throw error;
    }
  }

  async updateMyMembership(
    userId: string,
    groupId: string,
    input: UpdateMyMembershipInput,
  ): Promise<{ membership: GroupMembershipDto }> {
    const { membership } = await this.requireMembership(groupId, userId);
    const set: Partial<typeof groupMembers.$inferInsert> = {};
    if (input.shareConfig !== undefined) {
      // Merge onto the current config; effective immediately for all days
      // (read-time masking — there are no consent snapshots to update).
      set.shareConfig = {
        ...normalizeShareConfig(membership.shareConfig),
        ...input.shareConfig,
      };
    }
    if (input.lastSeenAt !== undefined) {
      set.lastSeenAt = new Date(input.lastSeenAt);
    }
    const [updated] = await this.db
      .update(groupMembers)
      .set(set)
      .where(eq(groupMembers.id, membership.id))
      .returning();
    return { membership: toMembershipDto(updated) };
  }

  async createInteraction(
    callerId: string,
    groupId: string,
    input: CreateGroupInteractionInput,
  ): Promise<CreateGroupInteractionResponse> {
    const { group, membership } = await this.requireMembership(groupId, callerId);
    const subject = await this.activeMember(groupId, input.subjectUserId);
    if (!subject) throw new NotFoundException("Member not found");

    if (input.kind === "comment") {
      // Trainer groups: comments are coach-only; reactions stay open to all.
      if (group.category === "trainer" && !isCoach(group, membership)) {
        throw new ForbiddenException(
          "Only the coach can comment in trainer groups",
        );
      }
      const [row] = await this.db
        .insert(groupInteractions)
        .values({
          id: uuidv7(),
          groupId,
          authorId: callerId,
          subjectUserId: input.subjectUserId,
          subjectDate: input.subjectDate,
          kind: "comment",
          body: input.body,
        })
        .returning();
      const [author] = await this.db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, callerId));
      return {
        comment: {
          id: row.id,
          authorId: row.authorId,
          authorName: author?.name ?? "",
          body: row.body ?? "",
          createdAt: row.createdAt.toISOString(),
        },
      };
    }

    // Reaction toggle: a live identical reaction is removed, otherwise added.
    const emoji = input.emoji ?? "";
    const [existing] = await this.db
      .select()
      .from(groupInteractions)
      .where(
        and(
          eq(groupInteractions.groupId, groupId),
          eq(groupInteractions.authorId, callerId),
          eq(groupInteractions.subjectUserId, input.subjectUserId),
          eq(groupInteractions.subjectDate, input.subjectDate),
          eq(groupInteractions.emoji, emoji),
          eq(groupInteractions.kind, "reaction"),
          isNull(groupInteractions.deletedAt),
        ),
      );
    if (existing) {
      await this.db
        .update(groupInteractions)
        .set({ deletedAt: new Date() })
        .where(eq(groupInteractions.id, existing.id));
      return { reaction: { emoji, reacted: false } };
    }
    try {
      await this.db.insert(groupInteractions).values({
        id: uuidv7(),
        groupId,
        authorId: callerId,
        subjectUserId: input.subjectUserId,
        subjectDate: input.subjectDate,
        kind: "reaction",
        emoji,
      });
    } catch (error) {
      // Double-tap race on the partial unique index: already reacted.
      if (!isPgError(error, "23505")) throw error;
    }
    return { reaction: { emoji, reacted: true } };
  }

  /** Coach writes a client's target; applied directly, recorded via set_by. */
  async putMemberTargets(
    callerId: string,
    groupId: string,
    targetUserId: string,
    input: PutMemberTargetsInput,
  ): Promise<PutMemberTargetsResponse> {
    const { group, membership } = await this.requireMembership(groupId, callerId);
    if (!isCoach(group, membership)) {
      throw new ForbiddenException("Only the coach can set targets");
    }
    const client = await this.activeMember(groupId, targetUserId);
    if (!client) throw new NotFoundException("Member not found");

    return await this.db.transaction(async (tx) => {
      const [target] = await tx
        .insert(userTargets)
        .values({
          id: uuidv7(),
          userId: targetUserId,
          effectiveFrom: input.effectiveFrom,
          energyKcal: input.energyKcal,
          proteinG: input.proteinG,
          carbsG: input.carbsG,
          fatG: input.fatG,
          setBy: callerId,
        })
        .returning();
      // Re-snapshot days ON/AFTER effective_from that already have summaries
      // (usually just today) — days before it keep their old snapshot, so a
      // mid-week change never rewrites past adherence.
      const affected = await tx
        .select({ entryDate: dailySummaries.entryDate })
        .from(dailySummaries)
        .where(
          and(
            eq(dailySummaries.userId, targetUserId),
            gte(dailySummaries.entryDate, input.effectiveFrom),
          ),
        );
      await this.summaries.recomputeDays(
        tx,
        targetUserId,
        affected.map((r) => r.entryDate),
      );
      return {
        target: {
          id: target.id,
          userId: target.userId,
          effectiveFrom: target.effectiveFrom,
          energyKcal: target.energyKcal,
          proteinG: target.proteinG,
          carbsG: target.carbsG,
          fatG: target.fatG,
          setBy: target.setBy,
          createdAt: target.createdAt.toISOString(),
        },
      };
    });
  }

  async activeMember(
    groupId: string,
    userId: string,
  ): Promise<MemberRow | null> {
    const [row] = await this.db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.status, "active"),
        ),
      );
    return row ?? null;
  }

  /**
   * Invite + its live group by token. Unknown tokens and deleted groups 404;
   * revoked/expired/exhausted invites 410 so the join screen can say why.
   */
  private async loadLiveInvite(
    db: DbExecutor,
    token: string,
    opts: { forUpdate?: boolean } = {},
  ): Promise<{ invite: InviteRow; group: GroupRow }> {
    const query = db
      .select({ invite: groupInvites, group: groups })
      .from(groupInvites)
      .innerJoin(groups, eq(groupInvites.groupId, groups.id))
      .where(and(eq(groupInvites.token, token), isNull(groups.deletedAt)));
    const [row] = opts.forUpdate
      ? await query.for("update", { of: groupInvites })
      : await query;
    if (!row) throw new NotFoundException("Invite not found");
    const rejection = inviteRejection(row.invite);
    if (rejection !== null) {
      throw new GoneException(`Invite ${rejection}`);
    }
    return row;
  }
}
