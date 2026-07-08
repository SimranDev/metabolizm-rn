import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/app-header';
import AppTabs from '@/components/app-tabs';
import { ThemedView } from '@/components/themed-view';

/**
 * The main app shell: the persistent header above the native tab bar. Fonts,
 * theme, and the first-run gate live in the root layout ([../_layout.tsx]).
 */
export default function TabsLayout() {
  return (
    <ThemedView style={styles.container}>
      <AppHeader />
      <View style={styles.tabs}>
        <AppTabs />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabs: {
    flex: 1,
  },
});
