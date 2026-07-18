import * as schema from "@metabolizm/db";
import { expo } from "@better-auth/expo";
import { ConfigService } from "@nestjs/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { uuidv7 } from "uuidv7";

import type { Env } from "../config/env";
import type { Database } from "../db/db.module";

/** Injection token for the Better Auth instance. */
export const AUTH = Symbol("AUTH");

/**
 * The Better Auth server. Mounted at /v1/auth/* by AuthModule; sessions are
 * resolved per-request by SessionGuard. The drizzle schema's property names
 * equal Better Auth's field names and `usePlural` matches the pluralized
 * table exports, so no model/field mapping is needed.
 */
export function createAuth(db: Database, config: ConfigService<Env, true>) {
  const appleClientId = config.get("APPLE_CLIENT_ID", { infer: true });
  const googleClientId = config.get("GOOGLE_CLIENT_ID", { infer: true });
  const isProduction =
    config.get("NODE_ENV", { infer: true }) === "production";

  return betterAuth({
    baseURL: config.get("BETTER_AUTH_URL", { infer: true }),
    basePath: "/v1/auth",
    secret: config.get("BETTER_AUTH_SECRET", { infer: true }),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      usePlural: true,
    }),
    emailAndPassword: {
      enabled: true,
      // Matches the mobile client's validation.
      minPasswordLength: 8,
    },
    session: {
      // Signed short-lived session_data cookie: requests within maxAge skip
      // the sessions lookup in SessionGuard. Trade-off: a revoked session
      // stays usable on API calls for up to maxAge.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    socialProviders: {
      ...(appleClientId
        ? {
            apple: {
              clientId: appleClientId,
              // Unused for the native idToken flow (no code exchange).
              clientSecret: "",
              // Native tokens carry the app's bundle id as audience.
              appBundleIdentifier: config.get("APPLE_APP_BUNDLE_IDENTIFIER", {
                infer: true,
              }),
            },
          }
        : null),
      ...(googleClientId
        ? {
            google: {
              // The WEB client id — native idTokens are minted with it as
              // audience when the app configures webClientId.
              clientId: googleClientId,
              clientSecret:
                config.get("GOOGLE_CLIENT_SECRET", { infer: true }) ?? "",
            },
          }
        : null),
    },
    trustedOrigins: [
      "metabolizmrn://",
      "https://appleid.apple.com",
      ...(isProduction ? [] : ["exp://**"]),
    ],
    plugins: [expo()],
    // Repo convention: app-generated UUIDv7 ids (DB default is only a fallback).
    advanced: { database: { generateId: () => uuidv7() } },
  });
}

export type Auth = ReturnType<typeof createAuth>;
