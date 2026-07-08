/**
 * In-progress onboarding answers. Persisted to AsyncStorage so a mid-flow app
 * kill resumes where the user left off. Cleared once onboarding completes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type {
  ActivityLevel,
  Goal,
  HeightUnit,
  PlanId,
  Sex,
  WeightUnit,
} from '@/lib/health';

export type OnboardingAnswers = {
  goal?: Goal;
  sex?: Sex;
  /** ISO date string. */
  dob?: string;
  heightCm?: number;
  weightKg?: number;
  goalWeightKg?: number;
  activityLevel?: ActivityLevel;
  selectedPlanId?: PlanId;
  /** Signed weekly rate (kg) when the Custom plan is chosen. */
  customWeeklyRateKg?: number;
  /** Display-unit preferences, persisted app-wide once set. */
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
};

type OnboardingState = OnboardingAnswers & {
  set: (patch: Partial<OnboardingAnswers>) => void;
  reset: () => void;
};

const initial: OnboardingAnswers = {
  weightUnit: 'kg',
  heightUnit: 'cm',
};

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initial,
      set: (patch) => set(patch),
      reset: () => set(initial),
    }),
    {
      name: 'metabolizm-onboarding',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ set: _set, reset: _reset, ...answers }) => answers,
    },
  ),
);
