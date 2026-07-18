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
export async function signInWithApple(): Promise<AuthUser | null> {
  if (Platform.OS !== 'ios') {
    throw new Error('Apple sign-in is only available on iOS.');
  }
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw new Error('Apple sign-in failed. Please try again.');
  }
  if (!credential.identityToken) {
    throw new Error('Apple sign-in failed. Please try again.');
  }
  // TODO(auth-hardening): pass a hashed nonce to signInAsync and the raw one
  // here (needs expo-crypto) to prevent identity-token replay.
  const { data, error } = await authClient.signIn.social({
    provider: 'apple',
    idToken: { token: credential.identityToken },
  });
  if (error || !data) throw authError(error, 'Apple sign-in failed. Please try again.');
  return sessionUser();
}

let googleConfigured = false;

/** Resolves to null when the user dismisses the Google sheet. */
export async function signInWithGoogle(): Promise<AuthUser | null> {
  // EXPO_PUBLIC_ accesses must stay literal member expressions (inlined at
  // bundle time). Missing config degrades to a clear error, not a crash.
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!webClientId) {
    throw new Error('Google sign-in is not configured for this build.');
  }
  if (!googleConfigured) {
    GoogleSignin.configure({ webClientId, iosClientId });
    googleConfigured = true;
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
  }
}

/** The session cookie for authenticated API requests, or null. */
export async function getToken(): Promise<string | null> {
  return authClient.getCookie() || null;
}
