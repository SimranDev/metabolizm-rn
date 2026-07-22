import { dailySummaries, userProfiles, userTargets, users } from "@metabolizm/db";
import type {
  MeDto,
  PutMyProfileInput,
  PutMyTargetsInput,
  UpdateMeInput,
  UserProfileDto,
  UserTargetDto,
} from "@metabolizm/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, gte } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { DB, type Database } from "../db/db.module";
import { GroupsService } from "../groups/groups.service";
import { SummariesService } from "../summaries/summaries.service";

type UserRow = typeof users.$inferSelect;
type TargetRow = typeof userTargets.$inferSelect;
type ProfileRow = typeof userProfiles.$inferSelect;

function toProfileDto(row: ProfileRow): UserProfileDto {
  return {
    goal: row.goal,
    sex: row.sex,
    dob: row.dob,
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    goalWeightKg: row.goalWeightKg,
    activityLevel: row.activityLevel,
    heightUnit: row.heightUnit,
    planId: row.planId as UserProfileDto["planId"],
    customWeeklyRateKg: row.customWeeklyRateKg,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTargetDto(row: TargetRow): UserTargetDto {
  return {
    id: row.id,
    userId: row.userId,
    effectiveFrom: row.effectiveFrom,
    energyKcal: row.energyKcal,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    setBy: row.setBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMeDto(row: UserRow): MeDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
    timezone: row.timezone,
    weightUnit: row.weightUnit,
  };
}

/**
 * The user's own account row. This is the only writer of users.timezone, which
 * every server-side "today" pivots on — entry dates, logging streaks, and each
 * member's day in a group read. It defaults to UTC, so a client that never
 * calls this has all of those silently shifted by its real offset.
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly summaries: SummariesService,
    // Only for the owned-group handoff in deleteAccount — see below.
    private readonly groups: GroupsService,
  ) {}

  async me(userId: string): Promise<MeDto> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw new NotFoundException("User not found");
    return toMeDto(row);
  }

  /**
   * Partial patch: only the keys present in `input` are written. Building the
   * set map from what the caller actually sent is what keeps an unmentioned
   * preference from being reset to a default it never asked for.
   */
  async update(userId: string, input: UpdateMeInput): Promise<MeDto> {
    const patch: Partial<Pick<UserRow, "timezone" | "weightUnit">> = {};
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.weightUnit !== undefined) patch.weightUnit = input.weightUnit;

    const [row] = await this.db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (!row) throw new NotFoundException("User not found");
    return toMeDto(row);
  }

  /**
   * Set the caller's own calorie/macro targets.
   *
   * Without a row here every `daily_summaries` day snapshots NULL targets and
   * is therefore unscorable, which makes group adherence and leaderboards
   * permanently empty however much the user logs. Onboarding computes these
   * numbers, so this is what carries them from the device to the account.
   *
   * Append-only, exactly like the coach path (groups.service `putMemberTargets`)
   * — a new row per change rather than an update, so each day keeps the target
   * that was in force when it was scored. Only days on or after
   * `effectiveFrom` are re-snapshotted; earlier ones keep their own history.
   */
  async putMyTargets(
    userId: string,
    input: PutMyTargetsInput,
  ): Promise<UserTargetDto> {
    return await this.db.transaction(async (tx) => {
      const [target] = await tx
        .insert(userTargets)
        .values({
          id: uuidv7(),
          userId,
          effectiveFrom: input.effectiveFrom,
          energyKcal: input.energyKcal,
          proteinG: input.proteinG,
          carbsG: input.carbsG,
          fatG: input.fatG,
          // Self-set, as opposed to a coach's id on the groups path.
          setBy: userId,
        })
        .returning();

      const affected = await tx
        .select({ entryDate: dailySummaries.entryDate })
        .from(dailySummaries)
        .where(
          and(
            eq(dailySummaries.userId, userId),
            gte(dailySummaries.entryDate, input.effectiveFrom),
          ),
        );
      await this.summaries.recomputeDays(
        tx,
        userId,
        affected.map((r) => r.entryDate),
      );

      return toTargetDto(target);
    });
  }

  /** The caller's onboarding snapshot, or null if they never saved one. */
  async myProfile(userId: string): Promise<UserProfileDto | null> {
    const [row] = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    return row ? toProfileDto(row) : null;
  }

  /**
   * Upsert the caller's onboarding snapshot (1:1 on user_id). This holds only
   * the raw inputs a returning user reviews — the derived targets and weight
   * goal are written separately via putMyTargets / the weight module, so this
   * never touches daily_summaries.
   */
  async putMyProfile(
    userId: string,
    input: PutMyProfileInput,
  ): Promise<UserProfileDto> {
    const values = {
      goal: input.goal,
      sex: input.sex,
      dob: input.dob,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      goalWeightKg: input.goalWeightKg ?? null,
      activityLevel: input.activityLevel,
      heightUnit: input.heightUnit,
      planId: input.planId,
      customWeeklyRateKg: input.customWeeklyRateKg ?? null,
    };
    const [row] = await this.db
      .insert(userProfiles)
      .values({ id: uuidv7(), userId, ...values })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    return toProfileDto(row);
  }

  /**
   * Delete the account and everything belonging to it. Irreversible — there is
   * no soft-delete flag and no restore path.
   *
   * One `DELETE FROM users` does almost all of the work: every table that
   * references `users.id` is ON DELETE CASCADE, so the diary, weight history,
   * daily summaries, targets, onboarding profile, custom foods, group
   * memberships and invites all go with the row — as do the Better Auth
   * `sessions` and `accounts` rows, which is what makes the caller's own
   * session (and any other device's) dead the moment this commits.
   *
   * The single exception is `groups.owner_id`, which is ON DELETE RESTRICT so
   * that owned groups have to be dealt with explicitly rather than orphaned;
   * `releaseOwnedGroups` transfers or destroys them first, in this same
   * transaction, so a failure part-way leaves the account fully intact.
   *
   * What deliberately survives: rows that are somebody else's record, not this
   * user's. `diary_entries.food_id` and `user_targets.set_by` are ON DELETE SET
   * NULL, so another member's logged history keeps its denormalized snapshot
   * and a coach-set target keeps its effect after the setter leaves.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.groups.releaseOwnedGroups(tx, userId);
      const deleted = await tx
        .delete(users)
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      if (deleted.length === 0) throw new NotFoundException("User not found");
    });
  }
}
