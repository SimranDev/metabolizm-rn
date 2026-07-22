import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from 'expo-router';
import { createContext, useContext, type ReactNode } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { dark, light, type ThemeColors } from '@/theme/palette';
import { useThemePreference } from '@/theme/preference';

type Scheme = 'light' | 'dark';

export type Theme = {
  scheme: Scheme;
  colors: ThemeColors;
};

// Module-level, frozen values: the context identity only changes when the OS
// scheme actually flips, so consumers never re-render on unrelated updates.
const THEMES: Record<Scheme, Theme> = {
  light: { scheme: 'light', colors: light },
  dark: { scheme: 'dark', colors: dark },
};

// Navigation chrome (expo-router / react-navigation) fed from the same tokens.
const NAV_THEMES = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: light.primary,
      background: light.bg,
      card: light.surface,
      text: light.text,
      border: light.border,
      notification: light.danger,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: dark.primary,
      background: dark.bg,
      card: dark.surface,
      text: dark.text,
      border: dark.border,
      notification: dark.danger,
    },
  },
};

const ThemeContext = createContext<Theme>(THEMES.light);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const raw = useColorScheme();
  const preference = useThemePreference((s) => s.preference);
  // Light is the default: null/undefined/'unspecified' all resolve to light.
  // An explicit preference overrides the OS; 'system' defers to it, so the
  // stored value is the choice itself and never a resolved snapshot of it —
  // otherwise "System" would freeze at whatever the OS was when it was picked.
  const scheme: Scheme =
    preference === 'system' ? (raw === 'dark' ? 'dark' : 'light') : preference;
  return (
    <ThemeContext.Provider value={THEMES[scheme]}>
      <NavThemeProvider value={NAV_THEMES[scheme]}>{children}</NavThemeProvider>
    </ThemeContext.Provider>
  );
}

/** Kinetic theme: `const { colors, scheme } = useTheme()`. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
