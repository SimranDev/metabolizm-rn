import { useCallback, useEffect, useState } from "react";

import { getFood } from "@/lib/api";
import type { FoodDto } from "@metabolizm/shared";

export type FoodDetailState = {
  detail: FoodDto | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

type Committed = { key: string; detail: FoodDto | null; error: string | null };

/**
 * Lazily fetch one catalog food's full record (macro columns, nutrients map,
 * and portions) for the nutrition-info screen. `loading`/`error` are derived
 * from a committed result keyed by the request (foodId + retry) rather than set
 * synchronously in the effect — mirroring `useFoodSearch`, which keeps the effect
 * free of cascading setState. The in-flight request aborts on unmount / retry.
 */
export function useFoodDetail(foodId: string): FoodDetailState {
  const [attempt, setAttempt] = useState(0);
  const key = `${foodId}#${attempt}`;
  const [committed, setCommitted] = useState<Committed>({ key: "", detail: null, error: null });

  const reload = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (!foodId) return;

    const controller = new AbortController();
    let active = true;

    getFood(foodId, { signal: controller.signal })
      .then((result) => {
        if (active) setCommitted({ key, detail: result, error: null });
      })
      .catch((err: unknown) => {
        // A superseded request rejects with AbortError — a newer effect owns the UI.
        if (err instanceof Error && err.name === "AbortError") return;
        if (active) {
          setCommitted({
            key,
            detail: null,
            error: err instanceof Error ? err.message : "Couldn't load nutrition details.",
          });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [foodId, key]);

  if (!foodId) {
    return { detail: null, loading: false, error: "Nutrition details aren't available for this item.", reload };
  }
  // Result for the current request hasn't landed yet (in flight).
  if (committed.key !== key) return { detail: null, loading: true, error: null, reload };
  return { detail: committed.detail, loading: false, error: committed.error, reload };
}
