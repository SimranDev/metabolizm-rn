/**
 * Diary endpoints (apps/api diary + sync modules).
 *
 * Nutrition values crossing this boundary are the CONSUMED amounts for the
 * logged quantity, never per 100 base units — the catalog owns per-100 figures,
 * the diary owns what was actually eaten.
 *
 * Entry ids are client-generated UUIDv7. That is what makes the outbox safe:
 * replaying a queued push is an idempotent upsert rather than a duplicate meal.
 */

import type {
  DiaryDaysResponse,
  DiaryEntryUpsert,
  DiaryRecentsResponse,
  SyncDiaryResponse,
  UpsertDiaryEntriesResponse,
} from "@metabolizm/shared";

import { apiRequest } from "./client";

type Signal = { signal?: AbortSignal };

/** Batched: multi-select add-food logs several foods at once. Atomic — one bad entry fails all 50. */
export function upsertEntries(
  entries: DiaryEntryUpsert[],
  opts?: Signal,
): Promise<UpsertDiaryEntriesResponse> {
  return apiRequest("/diary/entries", {
    method: "PUT",
    body: { entries },
    ...opts,
  });
}

/** Soft-delete. The row comes back from `/sync/diary` with `deletedAt` set. */
export function deleteEntry(id: string, opts?: Signal): Promise<void> {
  return apiRequest(`/diary/entries/${id}`, { method: "DELETE", ...opts });
}

/** Inclusive `YYYY-MM-DD` range, at most 31 days (DIARY_DAYS_MAX_RANGE). */
export function listDays(
  params: { from: string; to: string },
  opts?: Signal,
): Promise<DiaryDaysResponse> {
  const query = new URLSearchParams({ from: params.from, to: params.to });
  return apiRequest(`/diary/days?${query.toString()}`, opts);
}

export function recents(
  params: { limit?: number } = {},
  opts?: Signal,
): Promise<DiaryRecentsResponse> {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString();
  return apiRequest(`/diary/recents${suffix ? `?${suffix}` : ""}`, opts);
}

/**
 * Delta pull. `since` is the opaque keyset cursor from the previous response;
 * omit it for a full pull. Returns tombstones too, so a delete made on another
 * device propagates.
 */
export function sync(
  params: { since?: string; limit?: number } = {},
  opts?: Signal,
): Promise<SyncDiaryResponse> {
  const query = new URLSearchParams();
  if (params.since) query.set("since", params.since);
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString();
  return apiRequest(`/sync/diary${suffix ? `?${suffix}` : ""}`, opts);
}
