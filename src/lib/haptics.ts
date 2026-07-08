/**
 * Thin wrapper over `expo-haptics` for the onboarding flow. Errors (e.g. a
 * device without a haptics engine) are swallowed — feedback is a nicety, never
 * a failure point.
 */

import * as Haptics from 'expo-haptics';

export const haptics = {
  /** Selection change — picking an option, toggling a unit. */
  select: () => Haptics.selectionAsync().catch(() => {}),
  /** Light tap on advancing a step. */
  advance: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  /** Success flourish on finishing onboarding. */
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
};
