import '@/global.css';

import {
  InstrumentSans_400Regular,
  InstrumentSans_400Regular_Italic,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useProfile } from '@/store/profile';
import { ThemeProvider, useTheme } from '@/theme';
import { initWidgetSync } from '@/widgets/sync';

SplashScreen.preventAutoHideAsync();

/**
 * Root layout + first-run gate. Loads fonts, sets the theme and splash overlay,
 * and routes to onboarding vs. the app based on the persisted `onboardingComplete`
 * flag. The `(onboarding)` group is only mounted (and its animation code only
 * evaluated) while a user is actually onboarding, so it never runs in the
 * everyday hot path.
 */
export default function RootLayout() {
  const hydrated = useProfile((s) => s.hydrated);
  const onboardingComplete = useProfile((s) => s.onboardingComplete);
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    InstrumentSans_400Regular,
    InstrumentSans_400Regular_Italic,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  });

  // Keep the home-screen widgets fed with today's diary data.
  useEffect(() => {
    initWidgetSync();
  }, []);

  // Hold the native splash until fonts AND the persisted profile are ready, so we
  // never flash the wrong route (onboarding vs. app) before hydration completes.
  if ((!fontsLoaded && !fontError) || !hydrated) {
    return null;
  }

  return (
    <ThemeProvider>
      <ThemedStatusBar />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={onboardingComplete}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add-food" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="food-detail" options={{ presentation: 'fullScreenModal' }} />
          {/* Groups drill-downs push above the tabs — they carry their own
              header, since the persistent AppHeader belongs to the tab group.
              Create and join are pushes, not modals: both `replace` themselves
              with the group they just produced, which would otherwise leave
              the group detail stuck in a modal presentation. */}
          <Stack.Screen name="group/[id]" />
          <Stack.Screen name="member-day" />
          <Stack.Screen name="create-group" />
          <Stack.Screen name="join-group" />
          <Stack.Screen name="group-sharing" options={{ presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={!onboardingComplete}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
      </Stack>
      <AnimatedSplashOverlay />
    </ThemeProvider>
  );
}

/**
 * The single app-wide status bar, fed by the same theme context as the color
 * tokens so it flips with the scheme. No screen may set its own style.
 */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}
