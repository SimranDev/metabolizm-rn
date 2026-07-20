import { users } from "@metabolizm/db";
import type { MeDto, UpdateMeInput } from "@metabolizm/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { DB, type Database } from "../db/db.module";

type UserRow = typeof users.$inferSelect;

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
  constructor(@Inject(DB) private readonly db: Database) {}

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
}
