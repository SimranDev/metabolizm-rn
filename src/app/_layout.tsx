import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Inter: require('@/assets/fonts/Inter-Regular.otf'),
    'Inter-SemiBold': require('@/assets/fonts/Inter-SemiBold.otf'),
    'Inter-ExtraLight': require('@/assets/fonts/Inter-ExtraLight.otf'),
  });

  // Keep the splash screen up until the fonts are ready to avoid a flash of
  // fallback text. The native splash is hidden by AnimatedSplashOverlay once it
  // mounts below.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
