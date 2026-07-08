import { Stack } from 'expo-router/stack';

/**
 * Onboarding stack. One question per screen; the native push transition provides
 * the (subtle) motion between steps for free — no animation library needed.
 */
export const unstable_settings = {
  initialRouteName: 'welcome',
};

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
