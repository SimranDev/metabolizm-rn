# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Product

**Metabolizm** is a Health & Fitness app (iOS + Android) — a "swiss-knife for fitness" whose **core is weight, calorie, and macro/micro tracking**, with many surrounding features. Users create a profile, set goals (gain muscle / lose weight / maintain, with BMR·TDEE-based targets), log food by search or **barcode scan**, get **recipe** suggestions, view a **health dashboard**, and import **steps/activity** from other fitness apps.

Intended stack for feature work:
- **Backend:** cloud from the start — auth + hosted database + multi-device sync.
- **Activity/steps:** Apple Health (iOS) + Android **Health Connect**.
- **Food data / barcodes:** **Open Food Facts + USDA** FoodData Central.
- **Monetization:** subscription tiers (free / pro / pro max) — the header's plan icon reflects the tier.

## Priorities & constraints

**Performance and small app size come first — ahead of animations and heavy assets.** Prefer lightweight dependencies and native primitives (SF Symbols on iOS, Material `md` symbols on Android) over large bundled images or Lottie; lazy-load where sensible and watch bundle/app size as features land.

## Project

Expo SDK 57 app (React Native 0.86, React 19.2, expo-router v57) targeting **iOS and Android only — there is no web version**. Some `*.web.tsx` split files remain from the Expo starter but are not a shipping target. TypeScript strict mode. Uses pnpm (pnpm-lock.yaml).

Expo APIs changed significantly in SDK 57 — consult https://docs.expo.dev/versions/v57.0.0/ before writing Expo-related code rather than relying on prior knowledge.

## Commands

- `pnpm ios` / `pnpm android` — build & run a dev build (`expo run:*`). Native modules (native tabs, `expo-symbols`) require a dev build, not Expo Go.
- `pnpm start` — start the Metro dev server (press `i`/`a` to open iOS/Android)
- `pnpm lint` — ESLint via `expo lint`
- `npx tsc --noEmit` — typecheck
- No test runner is configured. There is no web target (a `pnpm web` script exists from the starter but web is not supported).

There are no checked-in `ios/` or `android/` directories (gitignored); native projects are generated on demand (CNG/prebuild). Config lives in [app.json](app.json), which enables the `typedRoutes` and `reactCompiler` experiments.

## Architecture

Routing is file-based via expo-router (`main: "expo-router/entry"`). Routes live in [src/app/](src/app/): `index.tsx` (Dashboard), `log.tsx` (Log), `recipes.tsx` (Recipes), `profile.tsx` (Profile), and `_layout.tsx` — the root layout, which loads the Inter fonts (`useFonts`, gating render on load), sets up the ThemeProvider and splash overlay, and renders the shared [app-header.tsx](src/components/app-header.tsx) above the tabs. The header (plan icon · date · profile button) is persistent across all tabs because native tabs don't provide one.

**Platform-split components** are a starter pattern: files with a `.web.tsx`/`.web.ts` suffix replace their native counterpart on web. Web is not a shipping target (see Project), so the `.web.*` files are effectively legacy — but keep them in sync if you touch the native side, since they still get bundled.

- [app-tabs.tsx](src/components/app-tabs.tsx) uses `NativeTabs` from `expo-router/unstable-native-tabs` (native tab bar), while [app-tabs.web.tsx](src/components/app-tabs.web.tsx) builds a custom floating header from the headless `expo-router/ui` Tabs primitives. **A new tab route must be registered in both files.**
- Same pattern for [animated-icon.tsx](src/components/animated-icon.tsx)/[animated-icon.web.tsx](src/components/animated-icon.web.tsx) (splash overlay) and [use-color-scheme.ts](src/hooks/use-color-scheme.ts)/[use-color-scheme.web.ts](src/hooks/use-color-scheme.web.ts).

**Theming**: [src/constants/theme.ts](src/constants/theme.ts) defines `Colors` (light/dark), `Fonts` (per-platform via `Platform.select`; web fonts are CSS variables declared in [src/global.css](src/global.css)), and a `Spacing` scale used instead of raw pixel values. Components consume the palette through the `useTheme()` hook or the `ThemedText`/`ThemedView` wrappers ([src/components/](src/components/)), which take theme-color names rather than hex values. `useColorScheme()` can return `'unspecified'`; existing code falls back to light in that case.

**Path aliases** (tsconfig): `@/*` → `src/*`, `@/assets/*` → `assets/*`.
