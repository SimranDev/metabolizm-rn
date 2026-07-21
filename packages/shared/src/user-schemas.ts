/**
 * Account preference writes. This is the only path that sets users.timezone,
 * which every server-side "today" pivots on — a stale value silently shifts
 * streaks and entry dates by a day, so the mobile client pushes the device
 * timezone on launch.
 */

import { z } from "zod";

import { entryDateSchema } from "./diary-schemas";
import { weightUnitSchema } from "./weight-schemas";

/**
 * Validated by construction rather than against a list: Intl.supportedValuesOf
 * isn't guaranteed on Hermes, and this schema is bundled into the app. Callers
 * are still safe if a bad value slips through — localDateFor falls back to UTC
 * rather than failing a whole group read.
 */
export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown IANA timezone");

// Partial patch with NO per-field defaults — see patchWeightEntrySchema.
export const updateMeSchema = z
  .object({
    timezone: timezoneSchema.optional(),
    weightUnit: weightUnitSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Patch must change at least one field",
  });

export type UpdateMeInput = z.output<typeof updateMeSchema>;

/**
 * The caller's own calorie/macro targets.
 *
 * Bounds match putMemberTargetsSchema — a coach setting a client's targets and
 * a user setting their own write the same `user_targets` row, and must agree on
 * what is acceptable. `effectiveFrom` is a local `YYYY-MM-DD`: days before it
 * keep whatever they already snapshotted, which is what stops a mid-week change
 * from rewriting past adherence.
 */
export const putMyTargetsSchema = z.object({
  effectiveFrom: entryDateSchema,
  energyKcal: z.number().min(0).max(99_999),
  proteinG: z.number().min(0).max(9_999),
  carbsG: z.number().min(0).max(9_999),
  fatG: z.number().min(0).max(9_999),
});

export type PutMyTargetsInput = z.output<typeof putMyTargetsSchema>;
