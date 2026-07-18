import { useEffect, useState } from "react";

import { searchFoods } from "@/lib/api";
import type { FoodListItemDto } from "@metabolizm/shared";

const DEBOUNCE_MS = 250;
/** Queries shorter than this don't search; the screen keeps showing recents. */
export const MIN_QUERY_LENGTH = 2;
const CACHE_MAX = 50;

// Session-lifetime query cache, module-level so it survives remounts of the
// add-food modal — backspacing to a previous query renders instantly with no
// request. Entries are write-once (a query's first page doesn't change within
// a session), which keeps the render-time read below safe; only successes are
// cached so errors retry on re-type. Oldest-first eviction via Map insertion
// order.
const cache = new Map<string, FoodListItemDto[]>();

function cachePut(query: string, items: FoodListItemDto[]) {
  if (!cache.has(query) && cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(query, items);
}

export type FoodSearchState = {
  items: FoodListItemDto[];
  loading: boolean;
  error: string | null;
};

type Committed = { query: string; items: FoodListItemDto[]; error: string | null };

/**
 * Debounced catalog food search (first page only — no pagination in the UI
 * yet). Queries under MIN_QUERY_LENGTH resolve to no results and no loading,
 * so the caller can fall back to its own "recent" list. The in-flight request
 * is aborted when the query changes or the component unmounts, so stale
 * responses never overwrite newer results.
 *
 * `loading` is derived (the committed result's query not matching the current
 * one) rather than set synchronously, which keeps the effect free of cascading
 * setState.
 */
export function useFoodSearch(query: string): FoodSearchState {
  const q = query.trim();
  const [committed, setCommitted] = useState<Committed>({ query: "", items: [], error: null });

  useEffect(() => {
    if (q.length < MIN_QUERY_LENGTH || cache.has(q)) return;

    const controller = new AbortController();
    let active = true;

    const timer = setTimeout(() => {
      searchFoods(q, { signal: controller.signal })
        .then((response) => {
          cachePut(q, response.items);
          if (active) setCommitted({ query: q, items: response.items, error: null });
        })
        .catch((err: unknown) => {
          // A superseded request rejects with AbortError — a newer effect owns the UI.
          if (err instanceof Error && err.name === "AbortError") return;
          if (active) {
            setCommitted({ query: q, items: [], error: err instanceof Error ? err.message : "Food search failed." });
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  if (q.length < MIN_QUERY_LENGTH) return { items: [], loading: false, error: null };
  const cached = cache.get(q);
  if (cached) return { items: cached, loading: false, error: null };
  // Result for the current query hasn't landed yet (debounce window or in flight).
  if (committed.query !== q) return { items: [], loading: true, error: null };
  return { items: committed.items, loading: false, error: committed.error };
}
