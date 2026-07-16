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

pnpm monorepo (workspaces: `apps/*`, `packages/*`; single lockfile at root, default isolated linking):

- [apps/mobile/](apps/mobile/) — the Expo SDK 57 app (React Native 0.86, React 19.2, expo-router v57), package name `mobile`, targeting **iOS and Android only — there is no web version**. Some `*.web.tsx` split files remain from the Expo starter but are not a shipping target. TypeScript strict mode.
- [packages/shared/](packages/shared/) — `@metabolizm/shared`: pure data shapes shared with the future backend (food/USDA, health, diary, profile types), consumed as TypeScript source (`main`/`types` → `src/index.ts`, no build step — Metro transpiles workspace packages). zod is a dependency, reserved for upcoming schemas. **Rule:** pure types → `packages/shared`; runtime helpers (calc, unit conversions, USDA fetch/parse) → `apps/mobile/src/lib`. Never add `react`/`react-native` to its dependencies.

Metro is auto-configured for the workspace by `expo/metro-config` — there is deliberately **no metro.config.js**; don't add one.

Expo APIs changed significantly in SDK 57 — consult https://docs.expo.dev/versions/v57.0.0/ before writing Expo-related code rather than relying on prior knowledge.

## Commands

Run from the repo root (proxy scripts into `apps/mobile`):

- `pnpm ios` / `pnpm android` — build & run a dev build (`expo run:*`). Native modules (native tabs, `expo-symbols`) require a dev build, not Expo Go.
- `pnpm start` — start the Metro dev server (press `i`/`a` to open iOS/Android)
- `pnpm lint` — ESLint via `expo lint`
- `pnpm typecheck` — `tsc --noEmit` in every workspace package
- No test runner is configured. There is no web target (a `pnpm web` script exists from the starter but web is not supported).

There are no checked-in `ios/` or `android/` directories (gitignored); native projects are generated on demand (CNG/prebuild). Config lives in [apps/mobile/app.json](apps/mobile/app.json), which enables the `typedRoutes` and `reactCompiler` experiments.

## Architecture

All paths below are inside `apps/mobile/`. Routing is file-based via expo-router (`main: "expo-router/entry"`). [src/app/_layout.tsx](apps/mobile/src/app/_layout.tsx) is the root layout: it loads the Space Grotesk / Instrument Sans fonts (`useFonts`, gating render on load), sets up the ThemeProvider and splash overlay, and gates first-run via a Stack — the `(onboarding)` group until `onboardingComplete`, then the `(tabs)` group plus the `add-food` / `food-detail` full-screen modals.

Tab routes live in [src/app/(tabs)/](apps/mobile/src/app/(tabs)/): `index.tsx` (**Log — the landing tab**; it owns the index route because native tabs always open on `index.tsx` and there is no initial-tab override), `dashboard.tsx` (placeholder until the dashboard design is finalized — the previous draft components remain in [src/components/dashboard/](apps/mobile/src/components/dashboard/), currently unreferenced), `recipes.tsx`, and `profile.tsx`. The group's [_layout.tsx](apps/mobile/src/app/(tabs)/_layout.tsx) renders the shared [app-header.tsx](apps/mobile/src/components/app-header.tsx) (plan icon · date · profile button) above the tabs — persistent across all tabs because native tabs don't provide a header.

**Platform-split components** are a starter pattern: files with a `.web.tsx`/`.web.ts` suffix replace their native counterpart on web. Web is not a shipping target (see Project), so the `.web.*` files are effectively legacy — but keep them in sync if you touch the native side, since they still get bundled.

- [app-tabs.tsx](apps/mobile/src/components/app-tabs.tsx) uses `NativeTabs` from `expo-router/unstable-native-tabs` (native tab bar), while [app-tabs.web.tsx](apps/mobile/src/components/app-tabs.web.tsx) builds a custom floating header from the headless `expo-router/ui` Tabs primitives. **A new tab route must be registered in both files.**
- Same pattern for [animated-icon.tsx](apps/mobile/src/components/animated-icon.tsx)/[animated-icon.web.tsx](apps/mobile/src/components/animated-icon.web.tsx) (splash overlay) and [use-color-scheme.ts](apps/mobile/src/hooks/use-color-scheme.ts)/[use-color-scheme.web.ts](apps/mobile/src/hooks/use-color-scheme.web.ts).

**Theming — the "Kinetic" design system** lives in [src/theme/](apps/mobile/src/theme/): `palette.ts` (light/dark `ThemeColors` incl. role aliases `actionPrimary`/`inkStrong` and precomputed `*Soft` alphas), `typography.ts` (`Fonts` + the `Type` scale — Space Grotesk for display/ALL numerals with `tabular-nums`, Instrument Sans for UI/body), `tokens.ts` (`Spacing` 4px grid, `Radius`, `Motion`, `Elevation`), and `provider.tsx` (context `ThemeProvider` + `useTheme()` → `{ scheme, colors }`; light is the default, dark via OS; also feeds the expo-router nav theme). Never hardcode colors in screens — consume via `const { colors } = useTheme()`, `ThemedText`/`ThemedView`, or the kit in [src/components/ui/](apps/mobile/src/components/ui/) (Button, IconButton, Input, StatNumber, Badge, MacroBar, Card). **Role rules**: `accent` (lime) only for active states/progress/streaks/active tab (never body text, never lime text on light bg — use `accentText`); `macro*` colors only on macro visuals; `success`/`danger` only for status; selected/focused = 2px `focusRing` border. The provider's context values are frozen module constants — don't rebuild them per render (reactCompiler is on).

**Path aliases** ([apps/mobile/tsconfig.json](apps/mobile/tsconfig.json), app-internal): `@/*` → `src/*`, `@/assets/*` → `assets/*`. Shared data shapes (food/USDA, health, diary, profile types) are imported from `@metabolizm/shared` — the app barrels (`@/lib/food`, `@/lib/health`) export runtime helpers only, not types.
