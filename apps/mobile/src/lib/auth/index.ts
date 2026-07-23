/**
 * Auth interface for Metabolizm, backed by Better Auth on the api
 * (apps/api, mounted at /v1/auth). Keep this module the only place that
 * touches auth — screens call these helpers, never `authClient` directly.
 *
 * Social sign-in is the native idToken flow (no browser redirect): the
 * device obtains an identity token from Apple/Google and the server
 * verifies it. Cancelling the native sheet resolves to `null` — not an
 * error, callers must not show error text for it.
 */

import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { authClient, clearStoredSession } from './client';

export type AuthUser = { email: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(email: string, password: string): void {
  if (!EMAIL_RE.test(email.trim())) {
    throw new Error('Enter a valid email address.');
  }
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
}

/** Map Better Auth error codes to user-facing copy. */
function authError(
  error: { code?: string; message?: string } | null,
  fallback: string,
): Error {
  // Sign-in with a provider account that has no Metabolizm account: the server
  // refuses to create one on the sign-in path (disableImplicitSignUp). Matched
  // by message too — the idToken social flow surfaces this without the
  // SIGN_UP_DISABLED code on the client error.
  if (error?.code === 'SIGN_UP_DISABLED' || /sign\s?up disabled/i.test(error?.message ?? '')) {
    return new Error(
      "No Metabolizm account yet for that login. Go back and tap Get started to sign up.",
    );
  }
  switch (error?.code) {
    case 'USER_ALREADY_EXISTS':
      return new Error('An account with this email already exists.');
    case 'INVALID_EMAIL_OR_PASSWORD':
      return new Error('Incorrect email or password.');
    case 'PASSWORD_TOO_SHORT':
      return new Error('Password must be at least 8 characters.');
    case 'INVALID_EMAIL':
      return new Error('Enter a valid email address.');
    default:
      return new Error(error?.message || fallback);
  }
}

/** Whether an option object requests account creation (the sign-up path). */
type SocialOptions = { allowSignUp?: boolean };

export async function signUp(email: string, password: string): Promise<AuthUser> {
  validate(email, password);
  const trimmed = email.trim();
  const { data, error } = await authClient.signUp.email({
    email: trimmed,
    password,
    // Better Auth requires a name; there's no name field in onboarding, so
    // derive a starter one from the email local part.
    name: trimmed.split('@')[0],
  });
  if (error || !data) throw authError(error, 'Sign-up failed. Please try again.');
  return { email: data.user.email };
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  validate(email, password);
  const { data, error } = await authClient.signIn.email({
    email: email.trim(),
    password,
  });
  if (error || !data) throw authError(error, 'Sign-in failed. Please try again.');
  return { email: data.user.email };
}

/** iOS only. Resolves to null when the user cancels the Apple sheet. */
export async function signInWithApple(opts?: SocialOptions): Promise<AuthUser | null> {
  if (Platform.OS !== 'ios') {
    throw new Error('Apple sign-in is only available on iOS.');
  }
  // Replay protection: Apple gets the SHA-256 (hex) of a random nonce and
  // embeds it in the identity token; the server re-hashes the raw nonce we
  // send and compares (better-auth nonceMatches).
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw new Error('Apple sign-in failed. Please try again.');
  }
  if (!credential.identityToken) {
    throw new Error('Apple sign-in failed. Please try again.');
  }
  const { data, error } = await authClient.signIn.social({
    provider: 'apple',
    idToken: { token: credential.identityToken, nonce: rawNonce },
    // Only the sign-up screen allows creating an account; the sign-in screen
    // omits this so an unknown Apple id is rejected (SIGN_UP_DISABLED).
    requestSignUp: opts?.allowSignUp ?? false,
  });
  if (error || !data) throw authError(error, 'Apple sign-in failed. Please try again.');
  // Apple sends fullName only in the FIRST credential (never in the identity
  // token), which coincides with user creation — replace the email-derived
  // name the server just stored. Best-effort: never fail the sign-in.
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (fullName) {
    await authClient.updateUser({ name: fullName }).catch(() => {});
  }
  return sessionUser();
}

let googleConfigured = false;

/**
 * Configure the native Google SDK, once per launch. Returns false when this
 * build carries no client id, so callers degrade instead of crashing.
 *
 * `signOutOfGoogle` needs this as much as sign-in does: the native module
 * rejects every call with "GoogleSignin has not been configured" while its
 * client is null, and this flag resets on each cold start even though the
 * SDK's cached account survives.
 */
function configureGoogle(): boolean {
  // EXPO_PUBLIC_ accesses must stay literal member expressions (inlined at
  // bundle time).
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!webClientId) return false;
  if (!googleConfigured) {
    GoogleSignin.configure({ webClientId, iosClientId });
    googleConfigured = true;
  }
  return true;
}

/**
 * Drop the native Google SDK's cached account.
 *
 * Not optional, and not merely tidy. The Android SDK stores the last signed-in
 * account in the app's own SharedPreferences (`com.google.android.gms.signin`),
 * and `signIn()` skips the account chooser entirely for as long as that entry
 * exists. Without this call, signing out and back in silently re-authenticates
 * the same person and there is no way to pick a different account for the life
 * of the install. Verified on an emulator: the first sign-in launches gms
 * `AccountPickerActivity`, the second never does until the cache is cleared.
 *
 * Deliberately `signOut()` and not `revokeAccess()` — the latter also tears
 * down the OAuth grant, forcing a consent screen on every future sign-in.
 */
async function signOutOfGoogle(): Promise<void> {
  if (!configureGoogle()) return;
  await GoogleSignin.signOut().catch(() => {});
}

/** Resolves to null when the user dismisses the Google sheet. */
export async function signInWithGoogle(opts?: SocialOptions): Promise<AuthUser | null> {
  // Missing config degrades to a clear error, not a crash.
  if (!configureGoogle()) {
    throw new Error('Google sign-in is not configured for this build.');
  }
  let idToken: string | null;
  try {
    await GoogleSignin.hasPlayServices();
    const result = await GoogleSignin.signIn();
    if (result.type === 'cancelled') return null;
    idToken = result.data.idToken;
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play services is unavailable on this device.');
      }
    }
    throw new Error('Google sign-in failed. Please try again.');
  }
  if (!idToken) {
    throw new Error('Google sign-in failed. Please try again.');
  }
  const { data, error } = await authClient.signIn.social({
    provider: 'google',
    idToken: { token: idToken },
    // Only the sign-up screen allows creating an account; the sign-in screen
    // omits this so an unknown Google id is rejected (SIGN_UP_DISABLED).
    requestSignUp: opts?.allowSignUp ?? false,
  });
  if (error || !data) throw authError(error, 'Google sign-in failed. Please try again.');
  return sessionUser();
}

/** The signed-in user from the (just-established) session. */
async function sessionUser(): Promise<AuthUser> {
  const { data } = await authClient.getSession();
  if (!data) throw new Error('Sign-in failed. Please try again.');
  return { email: data.user.email };
}

export async function signOut(): Promise<void> {
  try {
    await authClient.signOut();
  } catch {
    // Best effort — the server session expires on its own.
  } finally {
    // The app must drop the session immediately even when the server call
    // fails (offline); on success this is a no-op re-delete.
    await clearStoredSession().catch(() => {});
    // Both sign-out and account deletion reach the native SDK through here:
    // `lib/session`'s deleteAccount also funnels into endSession -> signOut.
    await signOutOfGoogle();
  }
}

/** The session cookie for authenticated API requests, or null. */
export async function getToken(): Promise<string | null> {
  return authClient.getCookie() || null;
}

// Resolved once per launch: the id doesn't change within a session, and group
// screens need it on first paint to mark their own row "You".
let cachedUserId: string | null = null;

/**
 * The signed-in user's id, or null while it resolves (and when signed out).
 * Group screens use it to tell their own card, reaction, and comment apart
 * from everyone else's.
 */
export function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(cachedUserId);

  useEffect(() => {
    if (cachedUserId !== null) return;
    let active = true;
    authClient
      .getSession()
      .then(({ data }) => {
        cachedUserId = data?.user.id ?? null;
        if (active) setUserId(cachedUserId);
      })
      .catch(() => {
        // Signed out or offline — screens fall back to showing real names.
      });
    return () => {
      active = false;
    };
  }, []);

  return userId;
}
