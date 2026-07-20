import type { WeightRange, WeightSeriesResponse } from '@metabolizm/shared';
import { useCallback } from 'react';

import { useRequest, type RequestState } from '@/hooks/use-request';
import { weightApi } from '@/lib/api';

/**
 * The chart payload for a range. Bucketing, the EMA-smoothed trend and the
 * milestones are all computed server-side, so switching range is one request
 * and the client never re-derives statistics the API already stands behind.
 */
export function useWeightSeries(
  range: WeightRange,
): RequestState<WeightSeriesResponse> {
  const load = useCallback(
    (signal: AbortSignal) => weightApi.getSeries(range, { signal }),
    [range],
  );
  return useRequest(load);
}
