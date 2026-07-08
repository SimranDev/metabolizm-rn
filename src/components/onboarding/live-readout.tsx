import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Item = {
  label: string;
  value: string;
  tone?: 'default' | 'warn';
};

/**
 * A compact strip of computed feedback (BMI, TDEE, projected date) that updates
 * live as the user changes inputs. Pure text — the "interactive" delight comes
 * from the numbers reacting, not from animation.
 */
export function LiveReadout({ items }: { items: Item[] }) {
  const theme = useTheme();

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {items.map((item, i) => (
        <View key={item.label} style={styles.row}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} /> : null}
          <View style={styles.cell}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              {item.label}
            </ThemedText>
            <ThemedText
              type="smallBold"
              themeColor={item.tone === 'warn' ? 'danger' : 'text'}
              style={styles.value}>
              {item.value}
            </ThemedText>
          </View>
        </View>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
  },
  row: { flex: 1, flexDirection: 'row' },
  divider: { width: StyleSheet.hairlineWidth },
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  label: { textAlign: 'center' },
  value: { fontSize: 16, textAlign: 'center' },
});
