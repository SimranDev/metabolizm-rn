import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useProfile } from '@/store/profile';

SplashScreen.preventAutoHideAsync();

/**
 * Root layout + first-run gate. Loads fonts, sets the theme and splash overlay,
 * and routes to onboarding vs. the app based on the persisted `onboardingComplete`
 * flag. The `(onboarding)` group is only mounted (and its animation code only
 * evaluated) while a user is actually onboarding, so it never runs in the
 * everyday hot path.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hydrated = useProfile((s) => s.hydrated);
  const onboardingComplete = useProfile((s) => s.onboardingComplete);
  const [fontsLoaded, fontError] = useFonts({
    Inter: require('@/assets/fonts/Inter-Regular.otf'),
    'Inter-SemiBold': require('@/assets/fonts/Inter-SemiBold.otf'),
    'Inter-ExtraLight': require('@/assets/fonts/Inter-ExtraLight.otf'),
  });

  // Hold the native splash until fonts AND the persisted profile are ready, so we
  // never flash the wrong route (onboarding vs. app) before hydration completes.
  if ((!fontsLoaded && !fontError) || !hydrated) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={onboardingComplete}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!onboardingComplete}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
      </Stack>
      <AnimatedSplashOverlay />
    </ThemeProvider>
  );
}
