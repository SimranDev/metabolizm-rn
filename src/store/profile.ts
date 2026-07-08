/**
 * Finalized user profile + the `onboardingComplete` flag that the root layout
 * uses to decide between the onboarding flow and the app. Persisted to
 * AsyncStorage; `hydrated` gates the redirect so we never flash the wrong route.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type {
  ActivityLevel,
  Goal,
  HeightUnit,
  Macros,
  PlanId,
  Sex,
  WeightUnit,
} from '@/lib/health';

export type Profile = {
  goal: Goal;
  sex: Sex;
  /** ISO date string. */
  dob: string;
  heightCm: number;
  weightKg: number;
  goalWeightKg?: number;
  activityLevel: ActivityLevel;
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
  email: string;
  // Snapshot of the chosen plan at completion.
  planId: PlanId;
  targetCalories: number;
  macros: Macros;
};

type ProfileState = {
  hydrated: boolean;
  onboardingComplete: boolean;
  profile: Profile | null;
  completeOnboarding: (profile: Profile) => void;
  reset: () => void;
  _setHydrated: () => void;
};

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      hydrated: false,
      onboardingComplete: false,
      profile: null,
      completeOnboarding: (profile) => set({ profile, onboardingComplete: true }),
      reset: () => set({ profile: null, onboardingComplete: false }),
      _setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'metabolizm-profile',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ onboardingComplete, profile }) => ({ onboardingComplete, profile }),
      onRehydrateStorage: () => (state) => state?._setHydrated(),
    },
  ),
);
