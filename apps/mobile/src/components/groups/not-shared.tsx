import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, useTheme } from '@/theme';

/**
 * "Not shared" is a designed state, never a blank.
 *
 * The API omits fields a member doesn't share (they are absent from the
 * payload, not null), so every screen that could show a shared value renders
 * one of these in its place. A gap would read as "nothing logged"; this reads
 * as "this is private", which is the whole promise of the feature.
 */

type ChipProps = {
  /** What is withheld, e.g. "Calories" — shown as the chip's micro label. */
  label: string;
};

/** Block placeholder that occupies the slot a shared value would have filled. */
export function NotSharedChip({ label }: ChipProps) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityLabel={`${label}: not shared`}
      style={[
        styles.chip,
        { borderColor: colors.border, backgroundColor: colors.surfaceSunken },
      ]}>
      <ThemedText type="micro" themeColor="textTertiary">
        {label}
      </ThemedText>
      <View style={styles.row}>
        <SymbolView
          name={{ ios: 'lock.fill', android: 'lock' }}
          size={11}
          tintColor={colors.textTertiary}
          fallback={<View />}
        />
        <ThemedText type="sm" themeColor="textTertiary">
          Not shared
        </ThemedText>
      </View>
    </View>
  );
}

/** Inline lock note for a partial withholding, e.g. names shown but portions not. */
export function LockNote({ children }: { children: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      <SymbolView
        name={{ ios: 'lock.fill', android: 'lock' }}
        size={11}
        tintColor={colors.textTertiary}
        fallback={<View />}
      />
      <ThemedText type="sm" themeColor="textTertiary" style={styles.flex}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    // Stretches across a column, never `flex: 1` — as a direct child of a
    // scroll container that would fight the content height.
    alignSelf: 'stretch',
    minWidth: 120,
    gap: Spacing.s4,
    padding: Spacing.s12,
    borderRadius: Radius.md,
    borderWidth: 1,
    // Dashed reads as "deliberately empty" rather than "failed to load".
    borderStyle: 'dashed',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s4,
  },
  flex: {
    flex: 1,
  },
});
