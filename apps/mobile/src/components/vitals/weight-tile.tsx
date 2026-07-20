import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Sparkline } from '@/components/ui/sparkline';
import { StatNumber } from '@/components/ui/stat-number';
import { fromKg } from '@/lib/health';
import { formatDelta, formatWeightValue, trendArrow } from '@/lib/weight';
import { useWeight } from '@/store/weight';
import { Spacing, useTheme } from '@/theme';

/**
 * The Weight tile on the Vitals grid: current weight, week delta and a 30-day
 * sparkline, tapping through to the detail screen.
 *
 * Paints from the MMKV-cached summary immediately, so the grid never opens on
 * a spinner. A user with no weigh-ins gets an invitation to log one — not a
 * zero, which would read as "you weigh nothing" rather than "nothing yet".
 */
export function WeightTile() {
  const { colors } = useTheme();
  const router = useRouter();
  const summary = useWeight((s) => s.summary);
  const unit = useWeight((s) => s.unit);

  const stats = summary?.stats ?? null;
  const spark = summary?.sparkline ?? [];
  const hasData = stats?.currentKg != null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        hasData
          ? `Weight, ${formatWeightValue(stats!.currentKg!, unit)} ${unit}. Opens weight detail.`
          : 'Weight, not logged yet. Opens weight detail.'
      }
      onPress={() => router.push('/weight')}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <SymbolView
            name={{ ios: 'figure.stand', android: 'monitor_weight' }}
            size={16}
            tintColor={colors.primary}
            fallback={<View />}
          />
          <ThemedText type="micro" themeColor="textSecondary" style={styles.label}>
            Weight
          </ThemedText>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right' }}
            size={12}
            tintColor={colors.textTertiary}
            fallback={<View />}
          />
        </View>

        {hasData ? (
          <>
            {spark.length >= 2 && (
              <Sparkline
                data={spark.map((p) => fromKg(p.kg, unit))}
                color={colors.primary}
                height={52}
                accessibilityLabel="Weight over the last 30 days"
              />
            )}
            <View style={styles.valueRow}>
              <StatNumber value={formatWeightValue(stats!.currentKg!, unit)} size="sm" />
              <ThemedText type="sm" themeColor="textSecondary">
                {unit}
              </ThemedText>
            </View>
            {stats!.changeKg !== null && (
              <ThemedText type="sm" themeColor="textSecondary" tabular numberOfLines={1}>
                {trendArrow(stats!.changeKg)} {formatDelta(stats!.changeKg, unit)} this month
              </ThemedText>
            )}
          </>
        ) : (
          <View style={styles.empty}>
            <ThemedText type="body" themeColor="textSecondary">
              Not logged yet
            </ThemedText>
            <ThemedText type="sm" themeColor="textTertiary">
              Tap to add your first weigh-in
            </ThemedText>
          </View>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flexBasis: '46%',
    flexGrow: 1,
  },
  card: {
    gap: Spacing.s4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s4,
  },
  label: {
    flex: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.s4,
  },
  empty: {
    gap: 2,
    paddingVertical: Spacing.s12,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
