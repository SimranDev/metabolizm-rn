import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { createAuthClient } from 'better-auth/react';

import { BASE_URL } from '@/lib/api/base-url';

const STORAGE_PREFIX = 'metabolizm';

/**
 * Better Auth client. The session cookies (token + session_data cache) are
 * kept in SecureStore by the expo plugin; other modules attach them to API
 * requests via `authClient.getCookie()` (see lib/api/client.ts). Screens
 * should not use this directly — go through lib/auth (the single auth
 * boundary).
 */
export const authClient = createAuthClient({
  // A path in baseURL doubles as the server's basePath (/v1/auth).
  baseURL: `${BASE_URL}/v1/auth`,
  plugins: [
    expoClient({
      scheme: 'metabolizmrn',
      storagePrefix: STORAGE_PREFIX,
      storage: SecureStore,
    }),
  ],
});

/**
 * Drop the expo plugin's SecureStore state: the cookie map and the cached
 * get-session payload (keys are `${storagePrefix}_cookie` /
 * `${storagePrefix}_session_data`). The plugin clears them itself on a
 * successful sign-out response; this is the guarantee for the failure path.
 */
export async function clearStoredSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(`${STORAGE_PREFIX}_cookie`),
    SecureStore.deleteItemAsync(`${STORAGE_PREFIX}_session_data`),
  ]);
}
