/**
 * Finalized user profile + the `onboardingComplete` flag that the root layout
 * uses to decide between the onboarding flow and the app. Persisted to
 * AsyncStorage; `hydrated` gates the redirect so we never flash the wrong route.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Profile } from '@metabolizm/shared';

type ProfileState = {
  onboardingComplete: boolean;
  profile: Profile | null;
  completeOnboarding: (profile: Profile) => void;
  /**
   * Patch the stored snapshot — targets, goal weight, unit preferences.
   * The Log tab reads `targetCalories` straight off this, so a settings change
   * that only reached the server would leave the day's ring scored against the
   * old number until the next sign-in.
   */
  updateProfile: (patch: Partial<Profile>) => void;
  reset: () => void;
};

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      onboardingComplete: false,
      profile: null,
      completeOnboarding: (profile) => set({ profile, onboardingComplete: true }),
      updateProfile: (patch) =>
        set((state) => (state.profile ? { profile: { ...state.profile, ...patch } } : state)),
      reset: () => set({ profile: null, onboardingComplete: false }),
    }),
    {
      name: 'metabolizm-profile',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ onboardingComplete, profile }) => ({ onboardingComplete, profile }),
    },
  ),
);

/**
 * Whether the persisted profile has been read back off disk yet.
 *
 * Read through `useSyncExternalStore` rather than kept as a `hydrated` field on
 * the store: AsyncStorage resolves asynchronously and can finish before React
 * has mounted the tree, so setting it from `onRehydrateStorage` updated state
 * mid-render and made every cold start log "Can't perform a React state update
 * on a component that hasn't mounted yet". Subscribing is what this API is for,
 * and it avoids the cascading render an effect + setState would cause.
 */
export function useProfileHydrated(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => useProfile.persist.onFinishHydration(onStoreChange),
    () => useProfile.persist.hasHydrated(),
  );
}
