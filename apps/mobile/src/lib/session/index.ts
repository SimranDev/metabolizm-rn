/**
 * Ending a session.
 *
 * Signing out has to do more than drop the auth cookie. Every persisted store
 * caches data belonging to the account that was signed in — the diary, the
 * weight history, and most sensitively the groups cache, which holds OTHER
 * members' shared data. Leaving any of it on disk would show it to whoever
 * signs in next on the same device.
 *
 * So this is the only sanctioned sign-out path. Calling `signOut()` from
 * `lib/auth` directly clears the session but leaves all of that behind.
 */

import { usersApi } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { useDiary } from "@/store/diary";
import { useGroups } from "@/store/groups";
import { useOnboarding } from "@/store/onboarding";
import { useProfile } from "@/store/profile";
import { useSummaries } from "@/store/summaries";
import { useWeight } from "@/store/weight";

/**
 * Wipe every account-scoped store. Exported for tests and account switching.
 *
 * Account-scoped is the operative word: device preferences (the theme choice in
 * `theme/preference.ts`) are deliberately NOT reset here. They belong to the
 * phone, not the account, and survive both signing out and deleting.
 */
export function clearLocalData(): void {
  useDiary.getState().reset();
  useSummaries.getState().reset();
  useWeight.getState().reset();
  useGroups.getState().reset();
  useOnboarding.getState().reset();
  // Last: flipping `onboardingComplete` moves the root Stack back to the
  // onboarding group, unmounting the screens that read the stores above.
  useProfile.getState().reset();
}

/**
 * Sign out and forget the account on this device.
 *
 * Order matters. The session is dropped first so that nothing can start a new
 * authenticated request against the account mid-teardown; the local wipe then
 * runs unconditionally, because a failed server call (offline) must still get
 * the user out rather than stranding them signed in with a dead session.
 */
export async function endSession(): Promise<void> {
  try {
    await signOut();
  } finally {
    clearLocalData();
  }
}

/**
 * Delete the account server-side, then tear this device down.
 *
 * The opposite order of guarantees from `endSession`, and deliberately so. Sign
 * out is best-effort: an offline user must still get out, so the local wipe runs
 * even when the server call fails. Deletion is the reverse — the server is the
 * only place the account actually exists, so nothing is wiped until it confirms
 * the row is gone. A failed call therefore leaves the user signed in with all
 * their data, seeing an error, rather than locally erased but still an account.
 *
 * After the delete lands the session is already dead server-side (the Better
 * Auth `sessions` rows cascade with the user), so `signOut` here is only about
 * dropping the cached cookie — hence best-effort, inside `endSession`.
 */
export async function deleteAccount(): Promise<void> {
  await usersApi.deleteMe();
  await endSession();
}
