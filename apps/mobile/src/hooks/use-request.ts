import { useCallback, useEffect, useState } from "react";

export type RequestState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-runs the request; use after a mutation changes what it would return. */
  reload: () => void;
};

type Committed<T> = {
  /** The `load` identity and nonce this result belongs to. */
  load: unknown;
  nonce: number;
  data: T | null;
  error: string | null;
};

/**
 * Runs an abortable request on mount and whenever `load` changes. Callers wrap
 * `load` in `useCallback` so its dependencies are the request's inputs:
 *
 *   const load = useCallback((signal) => groupsApi.getFeed(id, date, { signal }), [id, date]);
 *   const { data, loading, error } = useRequest(load);
 *
 * The in-flight request is aborted when the inputs change or the component
 * unmounts, so a stale response can never overwrite a newer one.
 *
 * `loading` is derived (the committed result not matching the current request)
 * rather than set synchronously, which keeps the effect free of cascading
 * setState — the same shape as `useFoodSearch`. A reload keeps the previous
 * data on screen until the new response lands.
 */
export function useRequest<T>(
  load: (signal: AbortSignal) => Promise<T>,
): RequestState<T> {
  const [nonce, setNonce] = useState(0);
  const [committed, setCommitted] = useState<Committed<T>>({
    load: null,
    nonce: -1,
    data: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    load(controller.signal)
      .then((data) => {
        if (active) setCommitted({ load, nonce, data, error: null });
      })
      .catch((err: unknown) => {
        // A superseded request rejects with AbortError — a newer effect owns the UI.
        if (err instanceof Error && err.name === "AbortError") return;
        if (active) {
          setCommitted({
            load,
            nonce,
            data: null,
            error: err instanceof Error ? err.message : "Something went wrong.",
          });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [load, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const settled = committed.load === load && committed.nonce === nonce;

  return {
    data: committed.data,
    loading: !settled,
    error: settled ? committed.error : null,
    reload,
  };
}
