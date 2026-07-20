/**
 * Weight endpoints (apps/api weight module).
 *
 * Every weight crossing this boundary is in KILOGRAMS. The `unit` on a
 * response is the user's display preference, not the unit of the numbers —
 * conversion happens once at render (see lib/weight). Converting on both sides
 * would round twice and drift the chart away from the history list.
 */

import type {
  WeightEntriesResponse,
  WeightEntryResponse,
  WeightGoalResponse,
  WeightRange,
  WeightSeriesResponse,
  WeightSummaryResponse,
  WeightUnit,
} from "@metabolizm/shared";

import { apiRequest } from "./client";

type Signal = { signal?: AbortSignal };

export type LogWeightInput = {
  /** Client-generated UUIDv7 — retrying a queued log is idempotent. */
  id?: string;
  entryDate: string;
  loggedAt: string;
  note?: string | null;
} & ({ weightKg: number } | { weight: number; unit: WeightUnit });

export function logWeight(
  input: LogWeightInput,
  opts?: Signal,
): Promise<WeightEntryResponse> {
  return apiRequest("/weight/entries", { method: "POST", body: input, ...opts });
}

export function listEntries(
  params: { cursor?: string; limit?: number } = {},
  opts?: Signal,
): Promise<WeightEntriesResponse> {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString();
  return apiRequest(`/weight/entries${suffix ? `?${suffix}` : ""}`, opts);
}

export function patchEntry(
  id: string,
  patch: {
    entryDate?: string;
    loggedAt?: string;
    note?: string | null;
    weightKg?: number;
  },
  opts?: Signal,
): Promise<WeightEntryResponse> {
  return apiRequest(`/weight/entries/${id}`, {
    method: "PATCH",
    body: patch,
    ...opts,
  });
}

/** Sends no body — Fastify 400s on an empty body with a JSON content-type. */
export function deleteEntry(id: string, opts?: Signal): Promise<void> {
  return apiRequest(`/weight/entries/${id}`, { method: "DELETE", ...opts });
}

export function getSeries(
  range: WeightRange,
  opts?: Signal,
): Promise<WeightSeriesResponse> {
  return apiRequest(`/weight/series?range=${range}`, opts);
}

export function getSummary(opts?: Signal): Promise<WeightSummaryResponse> {
  return apiRequest("/weight/summary", opts);
}

export function getGoal(opts?: Signal): Promise<WeightGoalResponse> {
  return apiRequest("/weight/goal", opts);
}

export function putGoal(
  input: {
    targetWeightKg: number;
    startingWeightKg?: number;
    targetDate?: string | null;
  },
  opts?: Signal,
): Promise<WeightGoalResponse> {
  return apiRequest("/weight/goal", { method: "PUT", body: input, ...opts });
}
