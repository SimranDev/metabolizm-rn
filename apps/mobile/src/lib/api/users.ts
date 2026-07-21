/**
 * The signed-in user's own account row (apps/api users module).
 *
 * `timezone` is the important one: the server defaults it to UTC and this is
 * its ONLY writer, yet every server-side "today" pivots on it — entry dates,
 * logging streaks, and each member's day in a group read. A device that never
 * pushes its zone has all of those silently shifted by its real offset.
 */

import type {
  MeResponse,
  MyTargetsResponse,
  PutMyTargetsInput,
  WeightUnit,
} from "@metabolizm/shared";

import { apiRequest } from "./client";

type Signal = { signal?: AbortSignal };

export function getMe(opts?: Signal): Promise<MeResponse> {
  return apiRequest("/users/me", opts);
}

export function updateMe(
  patch: { timezone?: string; weightUnit?: WeightUnit },
  opts?: Signal,
): Promise<MeResponse> {
  return apiRequest("/users/me", { method: "PATCH", body: patch, ...opts });
}

/**
 * Write the caller's calorie/macro targets.
 *
 * Append-only server-side: each call records a new row effective from the given
 * day, and `daily_summaries` snapshots whichever row was in force when a day
 * was scored. Without at least one of these every day is unscorable, so group
 * adherence and leaderboards stay empty no matter how much the user logs.
 */
export function putMyTargets(
  input: PutMyTargetsInput,
  opts?: Signal,
): Promise<MyTargetsResponse> {
  return apiRequest("/users/me/targets", { method: "PUT", body: input, ...opts });
}

/** The device's IANA zone, e.g. "America/Los_Angeles". */
export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Push the device's zone, fire-and-forget.
 *
 * Called on every launch AND immediately after sign-in/sign-up. The launch call
 * alone is not enough: on the launch where an account is created it has already
 * run and failed (no session existed yet), so the account would keep the
 * server's `UTC` default for the whole first session. At UTC+12 that files a
 * morning entry against the previous day.
 */
export function pushDeviceTimezone(): void {
  void updateMe({ timezone: deviceTimezone() }).catch(() => {});
}
