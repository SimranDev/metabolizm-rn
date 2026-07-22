/**
 * The daily rollup read model (apps/api summaries module).
 *
 * Deliberately NOT on the launch path. The day strip sums the diary entries
 * already in MMKV, so a cold start makes no request here at all; this is a
 * browse-time gap-filler for days the device no longer holds entries for, plus
 * the logging streak, which can be longer than the local window and is the one
 * number that genuinely has to come from the server.
 */

import type { SummaryDaysResponse } from "@metabolizm/shared";

import { apiRequest } from "./client";

type Signal = { signal?: AbortSignal };

/** Inclusive `YYYY-MM-DD` range, at most 400 days (SUMMARY_DAYS_MAX_RANGE). */
export function listDays(
  params: { from: string; to: string },
  opts?: Signal,
): Promise<SummaryDaysResponse> {
  const query = new URLSearchParams({ from: params.from, to: params.to });
  return apiRequest(`/summaries/days?${query.toString()}`, opts);
}
