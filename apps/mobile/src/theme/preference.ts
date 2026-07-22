/**
 * The appearance choice: follow the OS, or pin light/dark.
 *
 * A DEVICE preference, not account data — which is why it lives here beside the
 * theme rather than in `src/store/`, and why `lib/session`'s `clearLocalData`
 * must never reset it. Signing out or deleting the account hands the phone back
 * to its owner with the look they chose, exactly like the system setting it
 * shadows.
 *
 * Persisted through MMKV specifically because MMKV is synchronous: zustand
 * hydrates this during store creation, so the very first paint already has the
 * chosen scheme. An async engine here would flash light before switching to
 * dark on every cold start.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { zustandMmkvStorage } from "@/store/storage";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCE_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies readonly { value: ThemePreference; label: string }[];

type ThemePreferenceState = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

export const useThemePreference = create<ThemePreferenceState>()(
  persist(
    (set) => ({
      // Following the OS is the default, matching the behaviour before this
      // setting existed.
      preference: "system",
      setPreference: (preference) => set({ preference }),
    }),
    {
      name: "metabolizm-theme",
      storage: createJSONStorage(() => zustandMmkvStorage),
      partialize: ({ preference }) => ({ preference }),
    },
  ),
);
