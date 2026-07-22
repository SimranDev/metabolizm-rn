import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { Spacing, THEME_PREFERENCE_OPTIONS, useThemePreference } from '@/theme';

/**
 * Light / dark / follow-the-OS.
 *
 * A device preference, not account data: it is stored on the phone and survives
 * signing out, so a shared device keeps the look its owner picked. "System" is
 * stored as the choice rather than as the scheme it currently resolves to, so
 * the app keeps following the OS after the fact instead of freezing at whatever
 * it happened to be when the toggle was tapped.
 */
export function AppearanceCard() {
  const preference = useThemePreference((s) => s.preference);
  const setPreference = useThemePreference((s) => s.setPreference);

  return (
    <Card style={styles.card}>
      <ThemedText type="micro" themeColor="textSecondary">
        APPEARANCE
      </ThemedText>
      <Segmented
        options={THEME_PREFERENCE_OPTIONS}
        value={preference}
        onChange={setPreference}
      />
      <ThemedText type="sm" themeColor="textTertiary">
        {preference === 'system'
          ? 'Matches your device setting.'
          : `Always ${preference}, whatever your device is set to.`}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.s12 },
});
