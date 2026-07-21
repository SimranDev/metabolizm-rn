/**
 * Weight history, goal and unit preference.
 *
 * Weight data is tiny — a few dozen bytes an entry — so this caches
 * generously and treats MMKV as the read path: the Vitals tile and the chart
 * paint from disk on launch, then reconcile with the server in the background.
 * That is the opposite of the groups store, which deliberately caches nothing
 * per-group because those payloads contain OTHER members' data and must always
 * reflect their current sharing settings.
 *
 * A weigh-in logged offline goes into `pending` and is flushed on the next
 * successful read. Server state wins on conflict, except for pending writes
 * the server hasn't seen yet.
 */

import { uuidv7 } from "uuidv7";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { usersApi, weightApi } from "@/lib/api";
import { localDateKey } from "@/lib/weight";
import type {
  WeightEntryDto,
  WeightGoalDto,
  WeightSummaryResponse,
  WeightUnit,
} from "@metabolizm/shared";

import { zustandMmkvStorage } from "./storage";

/**
 * Roughly thirteen months of daily logging — enough to render every range up
 * to 1Y offline, at about 25 KB.
 */
const ENTRY_CAP = 400;

type Status = "idle" | "loading" | "ready" | "error";

/** A weigh-in logged while offline, replayed once a request succeeds. */
type PendingLog = {
  id: string;
  entryDate: string;
  loggedAt: string;
  weightKg: number;
  note: string | null;
};

type PersistedWeight = {
  entries: WeightEntryDto[];
  goal: WeightGoalDto | null;
  unit: WeightUnit;
  summary: WeightSummaryResponse | null;
  pending: PendingLog[];
};

type WeightState = PersistedWeight & {
  status: Status;
  error: string | null;
  refresh: () => Promise<void>;
  logWeight: (input: {
    weightKg: number;
    entryDate?: string;
    loggedAt?: string;
    note?: string | null;
  }) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  restoreEntry: (entry: WeightEntryDto) => Promise<void>;
  setUnit: (unit: WeightUnit) => void;
  setGoal: (input: {
    targetWeightKg: number;
    /**
     * Only needed when the account has no weigh-ins: the server otherwise
     * snapshots the latest one, and rejects the goal outright if there is none.
     */
    startingWeightKg?: number;
    targetDate?: string | null;
  }) => Promise<void>;
  flushPending: () => Promise<void>;
  /** Drop everything cached for the signed-in account. See lib/session. */
  reset: () => void;
};

const message = (err: unknown): string =>
  err instanceof Error ? err.message : "Something went wrong.";

/** Newest first, de-duplicated by id, capped. */
function mergeEntries(
  existing: WeightEntryDto[],
  incoming: WeightEntryDto[],
): WeightEntryDto[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const entry of incoming) byId.set(entry.id, entry);
  return [...byId.values()]
    .filter((e) => e.deletedAt === null)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
    .slice(0, ENTRY_CAP);
}

export const useWeight = create<WeightState>()(
  persist(
    (set, get) => ({
      entries: [],
      goal: null,
      unit: "kg",
      summary: null,
      pending: [],
      status: "idle",
      error: null,

      // `unit` goes back to the default too: it is a per-account preference
      // read from the server on the next refresh, not a device setting.
      reset: () =>
        set({
          entries: [],
          goal: null,
          unit: "kg",
          summary: null,
          pending: [],
          status: "idle",
          error: null,
        }),

      refresh: async () => {
        set({ status: "loading", error: null });
        try {
          await get().flushPending();
          const [summary, history] = await Promise.all([
            weightApi.getSummary(),
            weightApi.listEntries({ limit: 200 }),
          ]);
          set((state) => ({
            summary,
            goal: summary.goal,
            unit: summary.unit,
            entries: mergeEntries(state.entries, history.entries),
            status: "ready",
            error: null,
          }));
        } catch (err) {
          // Keep whatever is on disk visible — a failed refresh shouldn't
          // blank a chart the user can still read.
          set({ status: "error", error: message(err) });
        }
      },

      logWeight: async ({ weightKg, entryDate, loggedAt, note = null }) => {
        const now = new Date();
        const optimistic: WeightEntryDto = {
          // Client-generated so the retry after a failed send is an idempotent
          // upsert rather than a duplicate weigh-in.
          id: uuidv7(),
          entryDate: entryDate ?? localDateKey(now),
          weightKg,
          loggedAt: loggedAt ?? now.toISOString(),
          note,
          source: "manual",
          version: 1,
          updatedAt: now.toISOString(),
          deletedAt: null,
        };
        set((state) => ({
          entries: mergeEntries(state.entries, [optimistic]),
        }));

        try {
          const { entry } = await weightApi.logWeight({
            id: optimistic.id,
            entryDate: optimistic.entryDate,
            loggedAt: optimistic.loggedAt,
            weightKg,
            note,
          });
          set((state) => ({ entries: mergeEntries(state.entries, [entry]) }));
          void get().refresh();
        } catch (err) {
          set((state) => ({
            pending: [
              ...state.pending,
              {
                id: optimistic.id,
                entryDate: optimistic.entryDate,
                loggedAt: optimistic.loggedAt,
                weightKg,
                note,
              },
            ],
            error: message(err),
          }));
        }
      },

      removeEntry: async (id) => {
        const previous = get().entries;
        set({ entries: previous.filter((e) => e.id !== id) });
        try {
          await weightApi.deleteEntry(id);
          void get().refresh();
        } catch (err) {
          // Put it back — an undo affordance that silently lost the row would
          // be worse than the failure.
          set({ entries: previous, error: message(err) });
        }
      },

      restoreEntry: async (entry) => {
        set((state) => ({ entries: mergeEntries(state.entries, [entry]) }));
        try {
          await weightApi.logWeight({
            id: entry.id,
            entryDate: entry.entryDate,
            loggedAt: entry.loggedAt,
            weightKg: entry.weightKg,
            note: entry.note,
          });
          void get().refresh();
        } catch (err) {
          set({ error: message(err) });
        }
      },

      setUnit: (unit) => {
        // Optimistic: the toggle must feel instant, and the preference is
        // cosmetic enough that a failed write just resyncs on next refresh.
        set({ unit });
        void usersApi.updateMe({ weightUnit: unit }).catch(() => {});
      },

      setGoal: async ({ targetWeightKg, startingWeightKg, targetDate = null }) => {
        const { goal } = await weightApi.putGoal({
          targetWeightKg,
          targetDate,
          ...(startingWeightKg === undefined ? null : { startingWeightKg }),
        });
        set({ goal });
        void get().refresh();
      },

      flushPending: async () => {
        const queued = get().pending;
        if (queued.length === 0) return;
        const sent: string[] = [];
        for (const item of queued) {
          try {
            await weightApi.logWeight(item);
            sent.push(item.id);
          } catch {
            // Still offline — keep the rest queued and try again next time.
            break;
          }
        }
        if (sent.length > 0) {
          set((state) => ({
            pending: state.pending.filter((p) => !sent.includes(p.id)),
          }));
        }
      },
    }),
    {
      name: "metabolizm-weight",
      version: 1,
      storage: createJSONStorage(() => zustandMmkvStorage),
      partialize: (state): PersistedWeight => ({
        entries: state.entries,
        goal: state.goal,
        unit: state.unit,
        summary: state.summary,
        pending: state.pending,
      }),
      // Status is always derived fresh — a persisted "ready" would hide the
      // first refresh of the session.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedWeight>;
        return {
          ...current,
          entries: saved.entries ?? [],
          goal: saved.goal ?? null,
          unit: saved.unit ?? "kg",
          summary: saved.summary ?? null,
          pending: saved.pending ?? [],
        };
      },
    },
  ),
);

/** The most recent weigh-in, for prefilling the log sheet. */
export function useLatestEntry(): WeightEntryDto | null {
  return useWeight((s) => s.entries[0] ?? null);
}
