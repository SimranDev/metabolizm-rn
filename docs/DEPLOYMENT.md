# Deployment runbook

Getting the backend onto Railway and an installable APK onto a physical Android
phone. Local development is [DEVELOPMENT.md](DEVELOPMENT.md); this document
picks up where §5 ("Docker — production image") leaves off.

Target of this runbook: **a standalone APK that works on cellular data with no
laptop, Metro, or Docker running.**

## Why this is more than "point the app at a URL"

Three things in the repo make a hosted backend a hard prerequisite rather than
a nicety:

1. **HTTPS is mandatory.** `usesCleartextTraffic="true"` appears only in
   [`android/app/src/debug/AndroidManifest.xml`](../apps/mobile/android/app/src/debug/AndroidManifest.xml).
   A release or `preview` build refuses plain `http://` outright — the API must
   be TLS-terminated.
2. **`EXPO_PUBLIC_*` is inlined at bundle time.** `EXPO_PUBLIC_API_URL` and
   `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` are baked into the JS bundle when the
   build runs, and `.env` is gitignored — EAS archives the *git tree*, so it
   never sees it. Both live in [`eas.json`](../apps/mobile/eas.json) instead.
3. **A new signing key breaks Google sign-in.** EAS generates its own release
   keystore. The Android OAuth client registered against the debug SHA-1 (see
   [GOOGLE_SIGNIN.md](GOOGLE_SIGNIN.md)) stops matching, and the native SDK
   returns `DEVELOPER_ERROR`. A second Android OAuth client is required.

## Prerequisites

| Need | Why |
| --- | --- |
| Railway account (Hobby, ~$5/mo) | The free trial can't run a persistent database + service |
| Expo account | EAS Build |
| Access to the Google Cloud project | The second Android OAuth client (§3) |
| The deploy branch pushed to GitHub | Railway builds from the remote; EAS archives from git |
| `npm i -g eas-cli` | Everything Railway can be done in its web dashboard |

---

## 1. Railway — Postgres + API

No repo changes are needed: the root [Dockerfile](../Dockerfile) already builds
topologically (`pnpm run -r build`), packs with `pnpm deploy --prod --legacy`,
and *guards* both `dist/main.js` and the presence of the migrations inside
`@metabolizm/db`.

> **Never add a `--mount=type=cache` to that Dockerfile.** Railway rejects any
> cache mount whose id is not hardcoded as `s/<service-id>-<name>`, failing the
> build with *"is missing the cacheKey prefix from its id"* — and it does not
> accept the id through a build arg, so there is no portable spelling. Hardcoding
> a service id would also pin the file to one Railway service and break if that
> service were recreated. It buys nothing measurable here anyway: a cold
> `docker build --no-cache` is ~73 s either way, because `pnpm fetch` is already
> its own layer keyed on the lockfile.

1. **New project → Add Postgres.** The one provider-compatibility check that
   matters: `0001_food_catalog.sql` runs `CREATE EXTENSION IF NOT EXISTS
   pg_trgm` for the `foods_name_trgm_idx` GIN index. Railway's Postgres allows
   it; a provider that doesn't will fail on migrate.
2. **Add a service from the GitHub repo.** Root directory `/`, builder
   **Dockerfile**.
3. **Service variables.** These map 1:1 onto the zod schema in
   [`apps/api/src/config/env.ts`](../apps/api/src/config/env.ts), which fails
   fast on boot if any is missing or malformed:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — a Railway reference; resolves to the private-network URL |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` (schema enforces ≥32 chars) |
   | `BETTER_AUTH_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` — **keep the literal `https://`; origin only, no path** |
   | `GOOGLE_CLIENT_ID` | The **web** OAuth client id (same value as the app's `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`) |
   | `GOOGLE_CLIENT_SECRET` | The web client secret — the one genuine secret here |

   - `BETTER_AUTH_URL` must carry an explicit **scheme**. Railway's
     `${{RAILWAY_PUBLIC_DOMAIN}}` expands to a *bare hostname*
     (`foo.up.railway.app`), which `z.url()` rejects — the container then
     crash-loops on boot with `Invalid URL / at BETTER_AUTH_URL`. Write
     `https://${{RAILWAY_PUBLIC_DOMAIN}}`.
   - It takes no `/v1/auth` suffix:
     [`auth.instance.ts`](../apps/api/src/auth/auth.instance.ts) supplies
     `basePath: "/v1/auth"` itself, and the mobile client appends the same path
     to `BASE_URL`. Doubling it produces `/v1/auth/v1/auth/*` and every auth
     call 404s. Note this mistake **passes** env validation — the guard only
     checks that the value parses as a URL.
   - **Do not set `NODE_ENV`** — the Dockerfile's runtime stage already pins it
     to `production`, which is what disables the `x-user-id` dev fallback in
     [`caller-context.ts`](../apps/api/src/common/caller-context.ts) and drops
     `exp://**` from Better Auth's `trustedOrigins`.
   - **Do not set `PORT`** — Railway injects it and `main.ts` reads it through
     ConfigService.

4. **Networking → Generate Domain.** Set **Healthcheck Path** to `/v1/health`.
5. **Settings → Deploy → Pre-Deploy Command:**

   ```
   node node_modules/@metabolizm/db/dist/migrate.js
   ```

   That is the standalone migrator in
   [`packages/db/src/migrate.ts`](../packages/db/src/migrate.ts) — drizzle-orm's
   migrator over the committed SQL, no drizzle-kit needed, so it runs against
   production dependencies only. It is idempotent (drizzle keeps a journal
   table), so it is safe on every release.
6. **Verify:**

   ```bash
   curl https://<service>.up.railway.app/v1/health
   # {"status":"ok","version":"…","timestamp":"…"}
   ```

### Trusting the proxy

[`main.ts`](../apps/api/src/main.ts) constructs the adapter with
`trustProxy: true`. Behind Railway's TLS-terminating edge the socket is plain
http from the proxy's IP, so without it `request.protocol` reports `http` and
`request.ip` is the proxy for every caller. Better Auth is unaffected today (it
builds URLs from the configured `baseURL`), but anything added later that reads
either — rate limiting, request logging, redirects — would silently be wrong.

---

## 2. Seed the food catalog

Migrations create empty tables. Skip this and food search returns nothing, which
reads as a broken app rather than an empty database.

The dev database holds **6,577 `foods` + 12,435 `food_portions`** system rows
(USDA Foundation + SR Legacy, imported by the admin tool and then normalized by
`cleanup:usda`).

**Preferred — copy what's already verified locally.** Faster than re-parsing
217 MB of JSON, and it carries the name cleanup with it. Both tables are
self-contained for system rows (`owner_id` and `forked_from` are null):

Both `pg_dump` and `psql` run **inside the compose container** — there is no
Postgres client on the host, and none is needed:

```bash
# Dump (--no-owner/--no-privileges: the prod role has a different name)
docker exec metabolizm-rn-postgres-1 \
  pg_dump -U metabolizm -d metabolizm --data-only --no-owner --no-privileges \
  -t foods -t food_portions > /tmp/catalog.sql

# Restore — the container has psql and outbound network
docker exec -i metabolizm-rn-postgres-1 \
  psql "<railway PUBLIC database url>" -v ON_ERROR_STOP=1 -q < /tmp/catalog.sql
```

Use Railway's **public** proxy URL here — `*.railway.internal` only resolves
inside the project's private network.

`pg_dump` warns about a circular foreign key on `foods` (the self-referencing
`forked_from`). It is safe to ignore for a system-catalog dump: every
`source = 'system'` row has `forked_from` null, so nothing needs deferring.

Verify:

```sql
select source, count(*) from foods group by source;   -- system | 6577
select count(*) from food_portions;                   -- 12435
```

**Fallback — re-import from source.** Point `apps/admin/.env`'s `DATABASE_URL`
at the Railway public URL and run the importer (idempotent on
`foods.source_ref`), then the cleanup pass:

```bash
pnpm --filter admin import:usda data/FoodData_Central_foundation_food_json_2026-04-30.json
NODE_OPTIONS=--max-old-space-size=4096 \
  pnpm --filter admin import:usda data/FoodData_Central_sr_legacy_food_json_2018-04.json
pnpm --filter admin cleanup:usda
```

`apps/admin` is never deployed — it writes **system** catalog rows straight past
the user-scoped `/v1/catalog` API. Point it at production only for deliberate
seeding, then put its `.env` back.

---

## 3. Google sign-in for the EAS keystore

This is **blocking for sign-in** and can only be done *after* the first EAS
build, because the keystore doesn't exist until then.

1. Run the first build (§4). EAS generates a release keystore automatically.
2. Read its fingerprint:

   ```bash
   npx eas-cli@latest credentials -p android
   ```

3. Google Cloud console → APIs & Services → Credentials → **Create OAuth client
   ID → Android**. Package name `com.metabolizm.app`, SHA-1 = that fingerprint.
   Nothing from this client is pasted into code or env — registering the
   package + fingerprint pair is what makes Google trust the request.
4. **Keep the existing debug-SHA-1 client** so local `expo run:android` keeps
   working. An app can have as many Android OAuth clients as it has signing
   keys.
5. While the consent screen is in **Testing**, your Google account must be
   listed under **Test users** or sign-in returns `access_denied`.

`DEVELOPER_ERROR` on device means this step is missing or the fingerprint is
wrong.

---

## 4. EAS Build

[`apps/mobile/eas.json`](../apps/mobile/eas.json) holds two profiles.
`preview` is the one that produces an installable APK:

- `"distribution": "internal"` — EAS hosts an install page with a QR code.
- `"android": { "buildType": "apk" }` — an `.aab` cannot be sideloaded.
- `"appVersionSource": "remote"` + `autoIncrement` — EAS owns `versionCode`, so
  nothing in `app.json` has to be bumped by hand.
- `env` carries the two `EXPO_PUBLIC_*` values. Both are public by nature (the
  URL and the OAuth client id ship inside every bundle anyway); the client
  *secret* stays in Railway only. **`EXPO_PUBLIC_API_URL` must be `https://` —
  a release build blocks cleartext.**

Before the first build, replace `REPLACE_WITH_RAILWAY_DOMAIN` in both profiles
with the real Railway domain.

```bash
cd apps/mobile
npx eas-cli@latest init                                # writes extra.eas.projectId into app.json
npx eas-cli@latest build -p android --profile preview
```

### Monorepo notes

Listed so a failure is diagnosable — no action expected:

- EAS detects `pnpm-workspace.yaml` and archives from the **repo root**, then
  installs there. The `prepare` hooks on `@metabolizm/shared` and
  `@metabolizm/db` build their `dist/` during that install.
- `apps/mobile/android/` is gitignored, so EAS runs a clean CNG prebuild in the
  cloud — the intended flow.
  [`plugins/with-workmanager-fix.js`](../apps/mobile/plugins/with-workmanager-fix.js)
  is tracked and applies there.
- Metro resolves `@metabolizm/shared` through the `react-native` export
  condition to live TS source, exactly as locally. There is deliberately no
  `metro.config.js`; do not add one.
- The `iosUrlScheme: "com.googleusercontent.apps.REPLACE_WITH_IOS_CLIENT_ID"`
  placeholder in `app.json` is harmless for Android — it is an iOS-only config
  mod and an Android prebuild never runs it. It must be fixed before any iOS
  build.
- **`expo-dev-client` is not a dependency**, which is why there is no
  `development` profile here. Adding one with `"developmentClient": true`
  without installing the package produces an app that cannot attach to Metro.

---

## 5. Install and verify on the device

1. Uninstall any existing `com.metabolizm.app` first — the local
   `expo run:android` build is signed with a different key, and Android refuses
   to replace an app with a mismatched signature.
2. Open the EAS build page's QR / install link on the phone, allow "install
   unknown apps", install.
3. Sign in with Google, using an account listed as a Test user.
4. **Check the timezone write landed.** This is the one silent failure worth
   testing explicitly: `users.timezone` defaults to `'UTC'` server-side and
   every server "today" pivots on it, so a device that never PATCHes it has
   entry dates and streaks shifted by its real offset
   ([`lib/api/users.ts`](../apps/mobile/src/lib/api/users.ts) →
   `pushDeviceTimezone`).

   ```sql
   select email, timezone from users;   -- your real IANA zone, not UTC
   ```

5. Log a food, add a weigh-in, open the calendar sheet — then:

   ```sql
   select provider_id from accounts where provider_id = 'google';
   select count(*) from diary_entries;
   select local_date, energy_kcal, weight_kg
     from daily_summaries order by local_date desc limit 5;
   ```

6. Put the phone in airplane mode and reopen. The MMKV-first stores must still
   paint the Log tab and the week strip with zero requests.

### Symptom → cause

| Symptom | Cause |
| --- | --- |
| Railway build: *"flag `--mount=type=cache,id=…` is missing the cacheKey prefix from its id"* | A BuildKit cache mount was added to the Dockerfile — remove it (see §1) |
| Container crash-loops on boot: *"Environment validation failed: Invalid URL, at BETTER_AUTH_URL"* | The value has no scheme — `${{RAILWAY_PUBLIC_DOMAIN}}` alone is a bare hostname. Use `https://${{RAILWAY_PUBLIC_DOMAIN}}` |
| "Couldn't reach Metabolizm. Check your connection." | `EXPO_PUBLIC_API_URL` unset or `http://` at build time, or the Railway service is down |
| "Google sign-in is not configured for this build." | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` missing from the profile's `env` |
| `DEVELOPER_ERROR` from the native SDK | §3 not done, or the SHA-1 doesn't match this build's keystore |
| A brand-new Google account is rejected on sign-in | Working as designed — `disableImplicitSignUp: true`; only the post-onboarding sign-**up** screen passes `requestSignUp` |
| Food search returns nothing | §2 not done |
| Every auth call 404s | `BETTER_AUTH_URL` includes `/v1/auth` — it must be the origin only |
| Works, but dates are off by hours | The timezone PATCH failed — step 4 |
| App installs but immediately shows onboarding again after reinstall | Expected: local MMKV data lives in the app sandbox and is dropped on uninstall; the server-side profile is re-read on sign-in |

---

## Not covered here

- **OTA updates.** `expo.modules.updates.ENABLED` is `false`, so every JS change
  means a rebuild and reinstall. Adding `expo-updates` + EAS Update is a
  separate change.
- **iOS.** Needs Xcode on the build machine, a paid Apple Developer account, an
  iOS OAuth client, and the real `iosUrlScheme` in `app.json`.
- **Play Store release.** Needs a keystore decision (EAS-managed vs Play App
  Signing), an `.aab` profile, and a `submit` block in `eas.json`.
- **Custom domain, database backups, log drains, rate limiting.**
