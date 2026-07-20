/**
 * The user's groups — the list behind the Groups tab, plus the mutations that
 * change membership. Kept in a global zustand store (not screen state) because
 * creating, joining, leaving, and editing sharing all happen on separate
 * routes that must leave the tab consistent when they pop.
 *
 * The list is persisted via MMKV (see ./storage) so the tab paints instantly
 * on launch and then refreshes; per-group reads (feed, leaderboard, roster)
 * are fetched per screen and deliberately NOT cached to disk — they contain
 * other members' shared data, which must always reflect their current sharing
 * settings rather than a snapshot taken when they shared more.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { groupsApi } from "@/lib/api";
import { shareConfigDiff } from "@/lib/groups";
import type {
  GroupCategory,
  GroupDto,
  GroupListItemDto,
  GroupShareConfig,
} from "@metabolizm/shared";

import { zustandMmkvStorage } from "./storage";

type Status = "idle" | "loading" | "ready" | "error";

type PersistedGroups = { groups: GroupListItemDto[] };

type GroupsState = PersistedGroups & {
  status: Status;
  error: string | null;
  refresh: () => Promise<void>;
  createGroup: (input: { name: string; category: GroupCategory }) => Promise<GroupDto>;
  acceptInvite: (
    token: string,
    shareConfig: Partial<GroupShareConfig>,
  ) => Promise<GroupDto>;
  leave: (groupId: string) => Promise<void>;
  /** Sends only the toggles that changed; returns the server's merged config. */
  updateSharing: (
    groupId: string,
    before: GroupShareConfig,
    after: GroupShareConfig,
  ) => Promise<GroupShareConfig>;
  /** Clears the unread badge by moving my read marker to now. */
  markSeen: (groupId: string) => void;
};

const message = (err: unknown): string =>
  err instanceof Error ? err.message : "Something went wrong.";

export const useGroups = create<GroupsState>()(
  persist(
    (set, get) => ({
      groups: [],
      status: "idle",
      error: null,

      refresh: async () => {
        set({ status: "loading", error: null });
        try {
          const { groups } = await groupsApi.listGroups();
          set({ groups, status: "ready", error: null });
        } catch (err) {
          // Keep the persisted list on screen — a failed refresh shouldn't
          // blank a tab the user can still read.
          set({ status: "error", error: message(err) });
        }
      },

      createGroup: async (input) => {
        const { group } = await groupsApi.createGroup(input);
        await get().refresh();
        return group;
      },

      acceptInvite: async (token, shareConfig) => {
        const { group } = await groupsApi.acceptInvite(
          token,
          Object.keys(shareConfig).length > 0 ? shareConfig : undefined,
        );
        await get().refresh();
        return group;
      },

      leave: async (groupId) => {
        await groupsApi.leaveGroup(groupId);
        set((state) => ({ groups: state.groups.filter((g) => g.id !== groupId) }));
      },

      updateSharing: async (groupId, before, after) => {
        const patch = shareConfigDiff(before, after);
        if (Object.keys(patch).length === 0) return before;
        const { membership } = await groupsApi.updateMyMembership(groupId, {
          shareConfig: patch,
        });
        return membership.shareConfig;
      },

      markSeen: (groupId) => {
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId ? { ...g, unreadCount: 0 } : g,
          ),
        }));
        // Fire-and-forget: the badge is a convenience, and a failed write just
        // means it reappears on the next refresh.
        void groupsApi
          .updateMyMembership(groupId, { lastSeenAt: new Date().toISOString() })
          .catch(() => {});
      },
    }),
    {
      name: "metabolizm-groups",
      version: 1,
      storage: createJSONStorage(() => zustandMmkvStorage),
      partialize: (state): PersistedGroups => ({ groups: state.groups }),
      // Status is always derived fresh — a persisted "ready" would hide the
      // first refresh of the session.
      merge: (persisted, current) => ({
        ...current,
        groups: ((persisted ?? {}) as Partial<PersistedGroups>).groups ?? [],
      }),
    },
  ),
);

/** One group from the cached list, or null when it isn't loaded yet. */
export function useGroupSummary(groupId: string): GroupListItemDto | null {
  return useGroups((s) => s.groups.find((g) => g.id === groupId) ?? null);
}
