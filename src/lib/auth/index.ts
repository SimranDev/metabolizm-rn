/**
 * Auth interface for Metabolizm.
 *
 * The implementation below is a LOCAL STUB: it validates input and stores a fake
 * token in the device keychain so the rest of the app can be built against a real
 * shape. Replace the bodies with a real cloud backend (Supabase / Firebase / etc.)
 * later — keep this module the only place that touches auth, so nothing else changes.
 */

import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'metabolizm-auth-token';

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

export async function signUp(email: string, password: string): Promise<AuthUser> {
  validate(email, password);
  await SecureStore.setItemAsync(TOKEN_KEY, `stub.${Date.now()}`);
  return { email: email.trim() };
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  validate(email, password);
  // Stub: any well-formed credentials succeed.
  await SecureStore.setItemAsync(TOKEN_KEY, `stub.${Date.now()}`);
  return { email: email.trim() };
}

export async function signOut(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
