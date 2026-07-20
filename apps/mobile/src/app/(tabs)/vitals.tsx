import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StatTile, TileGrid } from '@/components/ui/stat-tile';
import { WeightTile } from '@/components/vitals/weight-tile';
import { useConsumed } from '@/store/diary';
import { useProfile } from '@/store/profile';
import { useWeight } from '@/store/weight';
import { BottomTabInset, Spacing } from '@/theme';

/**
 * Vitals — the at-a-glance grid.
 *
 * Only tiles with a real data source are here: weight (this feature) and the
 * two nutrition tiles derived from today's diary. Steps, sleep and heart rate
 * need Apple Health / Health Connect, and water and fasting need their own log
 * paths; none of those exist yet, and rendering them with sample numbers would
 * break the same promise the groups UI makes — a value shown is a value the
 * app can stand behind. They land here as their sources do.
 */
export default function VitalsScreen() {
  const refresh = useWeight((s) => s.refresh);
  const summary = useWeight((s) => s.summary);
  const consumed = useConsumed();
  const profile = useProfile((s) => s.profile);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Weight can be logged from the detail screen or the sheet; re-read on
  // return so the tile never shows a value the user just replaced.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const targetCalories = profile?.targetCalories ?? null;
  const targetProtein = profile?.macros.proteinG ?? null;
  const remaining =
    targetCalories === null ? null : Math.max(0, targetCalories - consumed.calories);
  const proteinToGo =
    targetProtein === null
      ? null
      : Math.max(0, targetProtein - consumed.macros.proteinG);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText type="h1" themeColor="inkStrong">
            Vitals
          </ThemedText>
          <ThemedText type="sm" themeColor="textSecondary">
            {today}
            {summary?.stats.streakDays ? ` · ${summary.stats.streakDays}-day streak` : ''}
          </ThemedText>
        </View>

        <TileGrid>
          <WeightTile />

          <StatTile
            icon={{ ios: 'circle.hexagongrid.fill', android: 'egg' }}
            label="PROTEIN"
            value={`${Math.round(consumed.macros.proteinG)}`}
            sub={
              proteinToGo === null
                ? 'no target set'
                : proteinToGo === 0
                  ? 'target hit'
                  : `${Math.round(proteinToGo)} g to go today`
            }
            tint="macroProtein"
            progress={
              targetProtein === null
                ? undefined
                : consumed.macros.proteinG / targetProtein
            }
          />

          <StatTile
            icon={{ ios: 'flame.fill', android: 'local_fire_department' }}
            label="ENERGY"
            value={`${Math.round(consumed.calories)}`}
            sub={
              targetCalories === null || remaining === null
                ? 'kcal today'
                : `of ${targetCalories.toLocaleString()} kcal · ${remaining} left`
            }
            tint="macroCarbs"
            progress={
              targetCalories === null ? undefined : consumed.calories / targetCalories
            }
          />
        </TileGrid>

        <ThemedText type="sm" themeColor="textTertiary" style={styles.footnote}>
          Steps, sleep and heart rate arrive with Apple Health and Health Connect.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.s24,
    paddingBottom: BottomTabInset + Spacing.s24,
    gap: Spacing.s16,
  },
  titleRow: {
    gap: 2,
    paddingTop: Spacing.s8,
  },
  footnote: {
    marginTop: Spacing.s8,
  },
});
