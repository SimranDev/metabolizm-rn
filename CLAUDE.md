# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Expo SDK 57 app (React Native 0.86, React 19.2, expo-router v57) targeting iOS, Android, and web. TypeScript strict mode. Uses pnpm (pnpm-lock.yaml).

Expo APIs changed significantly in SDK 57 — consult https://docs.expo.dev/versions/v57.0.0/ before writing Expo-related code rather than relying on prior knowledge.

## Commands

- `pnpm start` — start the dev server (Expo CLI); press `i`/`a`/`w` to open iOS/Android/web
- `pnpm ios` / `pnpm android` / `pnpm web` — start targeting a specific platform
- `pnpm lint` — ESLint via `expo lint`
- `npx tsc --noEmit` — typecheck
- No test runner is configured.

There are no checked-in `ios/` or `android/` directories (gitignored); native projects are generated on demand (CNG/prebuild). Config lives in [app.json](app.json), which enables the `typedRoutes` and `reactCompiler` experiments.

## Architecture

Routing is file-based via expo-router (`main: "expo-router/entry"`). Routes live in [src/app/](src/app/): `index.tsx` (Home), `explore.tsx` (Explore), and `_layout.tsx`, the root layout that sets up the ThemeProvider, splash overlay, and tabs.

**Platform-split components** are the key pattern: files with a `.web.tsx`/`.web.ts` suffix replace their native counterpart on web.

- [app-tabs.tsx](src/components/app-tabs.tsx) uses `NativeTabs` from `expo-router/unstable-native-tabs` (native tab bar), while [app-tabs.web.tsx](src/components/app-tabs.web.tsx) builds a custom floating header from the headless `expo-router/ui` Tabs primitives. **A new tab route must be registered in both files.**
- Same pattern for [animated-icon.tsx](src/components/animated-icon.tsx)/[animated-icon.web.tsx](src/components/animated-icon.web.tsx) (splash overlay) and [use-color-scheme.ts](src/hooks/use-color-scheme.ts)/[use-color-scheme.web.ts](src/hooks/use-color-scheme.web.ts).

**Theming**: [src/constants/theme.ts](src/constants/theme.ts) defines `Colors` (light/dark), `Fonts` (per-platform via `Platform.select`; web fonts are CSS variables declared in [src/global.css](src/global.css)), and a `Spacing` scale used instead of raw pixel values. Components consume the palette through the `useTheme()` hook or the `ThemedText`/`ThemedView` wrappers ([src/components/](src/components/)), which take theme-color names rather than hex values. `useColorScheme()` can return `'unspecified'`; existing code falls back to light in that case.

**Path aliases** (tsconfig): `@/*` → `src/*`, `@/assets/*` → `assets/*`.
