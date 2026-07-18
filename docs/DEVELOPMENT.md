# Development runbook

Practical commands for this monorepo. Everything here is derived from the root [package.json](../package.json) scripts, [docker-compose.yml](../docker-compose.yml), and the [Dockerfile](../Dockerfile).

## 1. Fresh clone → running

Prerequisites:

- **Node 20+** (24 LTS recommended — matches the production image)
- **pnpm via corepack** (bundled with Node; version is pinned by the `packageManager` field)
- **Docker** (Desktop or any daemon) for the dev database and production image

```bash
corepack enable                           # activates pnpm 10.21.0 from package.json
pnpm install                              # all workspaces; also builds packages/shared dist (prepare hook)
docker compose up -d                      # dev postgres:18 on localhost:5432
cp apps/api/.env.example apps/api/.env    # DATABASE_URL + PORT
pnpm db:migrate                           # apply drizzle migrations
pnpm api                                  # API watch mode → http://localhost:3000/v1/health
pnpm ios                                  # or: pnpm android — dev build on simulator/device (not Expo Go)
```

## 2. Daily commands

| Command | What it does |
| --- | --- |
| `pnpm api` | Rebuild shared + db, run the API in watch mode on :3000 (`Ctrl+C` stops) |
| `pnpm api:build` | Compile shared + db + api topologically → `apps/api/dist` |
| `pnpm admin` | Rebuild shared + db, run the internal admin tool (see §6) |
| `docker compose up -d` | Start dev postgres (data persists in a named volume) |
| `docker compose stop` | Stop postgres, keep container and data |
| `docker compose down` | Remove the container, keep the data volume |
| `pnpm start` | Metro dev server on :8081 (press `i`/`a` to open iOS/Android) |
| `pnpm start:inspect` | Metro in network-inspect mode: frees :8081, clears the cache, makes the DevTools Network tab record requests (see "Network inspection" below) |
| `pnpm android:inspect` | Fresh native build + install, then Metro in inspect mode — press `a` when Metro is up (see "Network inspection" below) |
| `pnpm ios` / `pnpm android` | Build & run a native dev build (`expo run:*`) |
| `pnpm lint` | Every package: `expo lint` (mobile) + `eslint .` (api) |
| `pnpm typecheck` | Build shared, then `tsc --noEmit` in every workspace package |
| `docker build -t metabolizm-api .` | Build the production API image |

### Mobile run modes — what `android` vs `start` actually do

The mobile app is **two separately started things**:

- **The native dev build** — the app binary on the emulator/device. `pnpm android` / `pnpm ios` compiles it (Gradle/Xcode), installs, and launches. Slow; only needed on first run and when the *native* side changes: a new native dependency, an `app.json` edit, an SDK upgrade. It is a dev build, not Expo Go (native tabs and `expo-symbols` don't run in Expo Go).
- **Metro** (`pnpm start`, :8081) — the dev server that feeds JavaScript to the installed app. All JS/TS/asset edits hot-reload through it with no rebuild. Terminal keys: `a`/`i` (re)launch the app, `r` reload, `j` open React Native DevTools (Console, Sources/breakpoints, Network).
- **Expo Go trap:** without the `expo-dev-client` package installed, a bare `expo start` defaults to Expo Go mode — pressing `a` then installs/opens **Expo Go**, not this app. Expo Go can't run our native modules (native tabs, `expo-symbols`, MMKV/Nitro), so routes error out and storage looks empty. The `start*` scripts pass `--dev-client` to force the right target; if you ever run `expo start` by hand and land in Go mode, press `s` to switch, or just open the metabolizm-rn app icon on the emulator manually.

Daily flow once the app is installed: just `pnpm start` + `a`. Keep **one** Metro on :8081 — a second instance leads to "which server is the app talking to?" confusion; `kill $(lsof -ti tcp:8081)` clears a stale one (the `*:inspect` scripts do this automatically). If DevTools says **"No compatible apps connected"**, the app isn't attached to this Metro — reopen the app on the emulator, or deep-link it straight to the server:

```bash
adb shell am start -a android.intent.action.VIEW -d "metabolizmrn://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

### Pointing the app at the API

Food search/detail hit the local backend, so run `pnpm api` (and the dev database) alongside Metro. The base URL comes from `EXPO_PUBLIC_API_URL` in `apps/mobile/.env`; left empty, the app defaults per platform — `http://localhost:3000` on iOS simulators, `http://10.0.2.2:3000` on Android emulators (the emulator's alias for the host machine). On a **physical device** set `EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3000` (the api binds `0.0.0.0`). `EXPO_PUBLIC_*` values are inlined into the bundle at build time — after changing one, restart Metro with a cache clear (`pnpm start:inspect` does this; or `expo start --clear`).

### Network inspection (DevTools Network tab)

Since SDK 56 the global `fetch` is Expo's native `expo/fetch` — faster, but it bypasses the JS networking layer DevTools instruments, so **requests succeed while the Network tab records nothing**. The `*:inspect` scripts opt a dev session out via `EXPO_PUBLIC_USE_RN_FETCH=1`, swapping the global back to RN's inspectable fetch. The flag is inlined into the bundle at build time, which is why both scripts also clear Metro's cache.

- `pnpm start:inspect` — Metro-only (no rebuild): frees :8081, clears the cache, serves the inspectable bundle. Open the app, press `j`, use the **Expo Network** tab — requests now record with headers, response preview, and timing.
- `pnpm android:inspect` — the same, preceded by a fresh native build. Two phases on purpose: `expo run:android --no-bundler` (build + install), then `expo start --clear` in inspect mode — `run:android` can't clear Metro's cache, and a stale cached bundle would silently ignore the flag. Press `a` once Metro's UI appears.
- Back to normal: `Ctrl+C`, then plain `pnpm start` — production-parity `expo/fetch` (brotli/zstd decompression, `AbortSignal.timeout`, response streaming).

Inspect mode is a debugging stance, not a code change: app code keeps calling the standard global `fetch`. Never `import { fetch } from 'expo/fetch'` directly — it buys nothing (the global already is `expo/fetch`) and pins those calls to the uninspectable engine regardless of the flag.

## 3. Database workflows

1. Edit the schema: [packages/db/src/schema.ts](../packages/db/src/schema.ts)
2. `pnpm db:generate` — diff against snapshots, write a new SQL migration to `packages/db/drizzle/` (prints `No schema changes, nothing to migrate` when clean). Custom name: `pnpm --filter @metabolizm/db exec drizzle-kit generate --name <name>`
3. `pnpm db:migrate` — apply unapplied migrations
4. `pnpm db:studio` — browse the database at https://local.drizzle.studio

All three read `DATABASE_URL` from `apps/api/.env` — [packages/db/drizzle.config.ts](../packages/db/drizzle.config.ts) loads it via a relative dotenv path, so that file stays the single source of truth.

Commit generated migrations (`packages/db/drizzle/`) together with the schema change.

### Viewing tables & data

- `pnpm db:studio` — Drizzle Studio at <https://local.drizzle.studio>: spreadsheet-style view of every table with filtering, foreign-key navigation, and inline row edits (edits write straight to the database). Needs the dev postgres up (`docker compose up -d`).
- `docker compose exec postgres psql -U metabolizm -d metabolizm` — raw SQL prompt inside the container, for when you know the query you want: `\dt` lists tables, `\d foods` describes one (columns, indexes), `\q` quits.

**Full local reset** (drops all data):

```bash
docker compose down -v && docker compose up -d && pnpm db:migrate
```

## 4. Workspace packages (`@metabolizm/shared`, `@metabolizm/db`)

- **Mobile/Metro reads `packages/shared/src` live** (react-native exports condition) — never needs a rebuild.
- **Node consumers (api, admin) use the compiled `dist/`** of both packages — after editing, rebuild:

```bash
pnpm --filter @metabolizm/shared build
pnpm --filter @metabolizm/db build
```

Rebuilds happen automatically in `pnpm install` (prepare hooks), `pnpm api`, `pnpm admin`, `pnpm api:build`, and `pnpm typecheck`. Only a bare `pnpm --filter api start:dev` / `pnpm --filter admin dev` can run against a stale dist. `@metabolizm/db` is Node-only — never import it from mobile.

## 5. Docker (production image)

```bash
docker build -t metabolizm-api .          # repo-root context; multi-stage, pnpm deploy
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgres://metabolizm:metabolizm@host.docker.internal:5432/metabolizm \
  metabolizm-api
curl http://localhost:3000/v1/health
```

- `host.docker.internal` reaches the compose postgres from inside the container.
- Common flags: `-d` (detach), `--name metabolizm-api`, `-e PORT=8080` (change `-p` to match).
- The build fails loudly if `dist/main.js` is missing (guards silent empty builds — see §7) or if the migrations didn't land in the image.
- **Migrations in the image** ship inside `@metabolizm/db` (its `files` include `drizzle/`) and run without drizzle-kit:

```bash
docker run --rm --entrypoint node \
  -e DATABASE_URL=postgres://metabolizm:metabolizm@host.docker.internal:5432/metabolizm \
  metabolizm-api node_modules/@metabolizm/db/dist/migrate.js
```

## 6. Admin tool (internal, dev-only)

Food-catalog admin at [apps/admin](../apps/admin): paste a USDA FoodData Central food JSON (deterministically mapped to a per-100 food record — no LLM) or start from a blank form, review, insert into the **system** catalog (`ownerId null`, `source system`, public, verified). Never deployed.

```bash
docker compose up -d                          # same dev postgres as the api
cp apps/admin/.env.example apps/admin/.env    # DATABASE_URL, PORT
pnpm admin                                    # Fastify :4000 + Vite SPA → http://localhost:5173
```

### Bulk import (USDA FoodData Central)

Seeds/refreshes the system catalog from the official JSON dumps:

1. Download **Foundation Foods** and/or **SR Legacy** (JSON) from <https://fdc.nal.usda.gov/download-datasets/> and unzip into `apps/admin/data/` (gitignored).
2. Run the import (idempotent — rows match on `foods.source_ref` = `fdc:<fdcId>`; re-runs update in place and bump `version`):

```bash
pnpm --filter admin import:usda data/FoodData_Central_foundation_food_json_2026-04-30.json
# SR Legacy is ~211MB and is JSON.parsed whole — raise the heap:
NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter admin import:usda data/FoodData_Central_sr_legacy_food_json_2018-04.json
```

USDA refreshes Foundation Foods each April and October — re-download and re-run to pick up changes. The summary reports inserted/updated/skipped counts and a histogram of FDC nutrients not yet in the shared registry.

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Metro serves stale or broken bundles (missing images/fonts, old code) | `cd apps/mobile && npx expo start --clear` (the `*:inspect` scripts always clear) |
| Press `j` → "No compatible apps connected, … only be used with Hermes" | Engine is fine — the app just isn't attached to this Metro. Reopen the app on the emulator (or use the deep-link in §2), then press `j` again |
| Requests succeed but the DevTools Network tab stays empty | Native `expo/fetch` bypasses the inspector — restart in inspect mode: `pnpm start:inspect` / `pnpm android:inspect` (§2) |
| "Failed to get NitroModules", routes "missing the required default export", app data seemingly wiped | The bundle is running in Expo Go, not the dev build (see the Expo Go trap in §2) — press `s` then `a` in the Metro terminal, or open the app icon manually. Real app data is untouched in its own sandbox |
| API doesn't see edits to `packages/shared` (missing exports, old types) | Stale dist — `pnpm --filter @metabolizm/shared build` |
| `nest build` "succeeds" but `apps/api/dist` is empty | Someone added `"incremental": true` to `apps/api/tsconfig.json` — remove it (TS 6 + [nest-cli#3312](https://github.com/nestjs/nest-cli/issues/3312)). Check: `test -f apps/api/dist/main.js` |
| `pnpm install` errors (`ERR_PNPM_*`, corrupt store) | `pnpm store prune`, then `rm -rf node_modules apps/*/node_modules packages/*/node_modules && pnpm install` |
| Port already in use | One-liner: `kill $(lsof -ti tcp:8081)` (3000 API, 5432 postgres, 8081 Metro); or set `PORT` in `apps/api/.env` / change the compose port mapping |
| Postgres container unhealthy or won't start | `docker compose logs postgres`; if hopeless: full reset (§3) |
| USDA import crashes with heap out-of-memory | The SR Legacy file needs `NODE_OPTIONS=--max-old-space-size=4096` (see §6) |
