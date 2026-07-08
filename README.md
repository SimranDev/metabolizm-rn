# Metabolizm

A Health & Fitness app for **iOS and Android** — a "swiss-knife for fitness" whose core is **weight, calorie, and macro/micro tracking**, with a growing set of surrounding features. You set your goals, log what you eat (by search or barcode), and Metabolizm keeps your calories, macros, micros, weight, and activity in one place.

> Status: early development. This document evolves with the project.

## Features

### Core
- **Profile & goals** — create a profile and set fitness goals (gain muscle, lose weight, maintain), with BMR/TDEE-based calorie and macro targets.
- **Food logging** — record calorie intake plus macros and micronutrients.
- **Barcode scanning** — scan a product to pull its nutrition details.
- **Recipes** — recipe suggestions that fit your goals and targets.
- **Health dashboard** — an at-a-glance view of the day's calories, macros, weight, and activity.
- **Activity import** — steps and activity synced from other fitness apps (Apple Health / Health Connect).
- **Light & dark mode** — full theming support.

### Built so far
- Four-tab navigation (Dashboard, Log, Recipes, Profile) with a shared top header (plan icon · date · profile button).
- Light/dark theming and the Inter type system.
- Placeholder screens for each tab — feature work is in progress.

### Roadmap / ideas
Water intake · weight & body-measurement trends with charts · TDEE/BMR calculators with adaptive goals · intermittent-fasting timer · workout/exercise logging with calories burned · saved meals, favorites & meal planning · streaks and reminder notifications · micronutrient targets & insights · progress photos · home-screen widgets · Apple Watch / Wear OS companion · CSV data export · goal-based onboarding · subscription tiers (free / pro / pro max).

## Tech stack

- **Expo SDK 57**, **React Native 0.86**, **React 19.2**, **expo-router v57**
- **TypeScript** (strict), **pnpm**
- **Platforms: iOS and Android only** — there is no web version. (Some `*.web.tsx` files remain from the Expo starter but are not a shipping target.)
- **Backend:** cloud from the start — authentication, a hosted database, and multi-device sync.
- **Integrations:** Apple Health (iOS) + Android Health Connect for activity/steps; Open Food Facts + USDA FoodData Central for product/nutrition data and barcodes.

## Priorities

**Performance and small app size come first — ahead of animations and heavy assets.** Prefer lightweight dependencies and native primitives (SF Symbols on iOS, Material symbols on Android) over large bundled images or Lottie animations, and keep an eye on bundle/app size as features land.

## Getting started

```bash
pnpm install
```

Run a dev build on a device/emulator (native modules such as native tabs and `expo-symbols` require a dev build, not Expo Go):

```bash
pnpm ios       # build & run on iOS  (expo run:ios)
pnpm android   # build & run on Android (expo run:android)
```

Checks:

```bash
pnpm lint          # ESLint (expo lint)
npx tsc --noEmit   # type-check
```

There is no `pnpm web` target. Native projects (`ios/`, `android/`) are generated on demand (CNG/prebuild) and are gitignored.

## Project structure

```
src/
  app/            file-based routes (expo-router): index (Dashboard), log, recipes, profile, _layout
  components/     shared UI (app-header, app-tabs, themed-text/-view, placeholder-screen, …)
  constants/      theme (Colors, Fonts, Spacing)
  hooks/          use-theme, use-color-scheme
assets/           fonts (Inter) and images
```

See [CLAUDE.md](CLAUDE.md) for architecture details (routing, platform-split components, theming, path aliases) and [AGENTS.md](AGENTS.md) for the Expo SDK 57 docs reminder.
