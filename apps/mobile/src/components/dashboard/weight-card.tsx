import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/ui/progress-bar';
import { sampleWeightSeriesKg } from '@/components/dashboard/sample-data';
import { Sparkline } from '@/components/ui/sparkline';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { StatNumber } from '@/components/ui/stat-number';
import { fromKg, kgToLb, kgToStLb } from '@/lib/health';
import type { WeightUnit } from '@metabolizm/shared';
import { Spacing, useTheme } from '@/theme';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sample journey: the user started this far from today's weight. */
const SAMPLE_START_OFFSET_KG = 3.6;

const formatWeight = (kg: number, unit: WeightUnit): string => {
  if (unit === 'st') {
    const { st, lb } = kgToStLb(kg);
    return `${st} st ${lb} lb`;
  }
  return `${fromKg(kg, unit).toFixed(1)} ${unit}`;
};

/** Small deltas read better in lb than fractional stone. */
const formatDelta = (kg: number, unit: WeightUnit): string =>
  unit === 'st' ? `${kgToLb(Math.abs(kg)).toFixed(1)} lb` : formatWeight(Math.abs(kg), unit);

type Props = {
  weightKg: number;
  goalWeightKg?: number;
  weightUnit: WeightUnit;
};

/**
 * 14-day weight trend (sample series anchored to the profile's real weight)
 * plus journey progress toward the goal weight and a naive on-pace projection
 * from the current weekly rate.
 */
export function WeightCard({ weightKg, goalWeightKg, weightUnit }: Props) {
  const { colors } = useTheme();
  // Captured once per mount — render-stable, and satisfies react-hooks/purity.
  const [now] = useState(() => Date.now());

  const series = sampleWeightSeriesKg(weightKg, goalWeightKg);
  const weekDeltaKg = series[series.length - 1] - series[series.length - 8];
  const falling = weekDeltaKg < 0;

  // Journey math — only when a goal weight exists and differs from today.
  const direction =
    goalWeightKg === undefined || goalWeightKg === weightKg
      ? 0
      : goalWeightKg < weightKg
        ? 1
        : -1;
  const hasGoal = direction !== 0 && goalWeightKg !== undefined;
  const startKg = weightKg + direction * SAMPLE_START_OFFSET_KG;
  const remainingKg = hasGoal ? Math.abs(weightKg - goalWeightKg) : 0;
  const journeyFraction = hasGoal
    ? SAMPLE_START_OFFSET_KG / (SAMPLE_START_OFFSET_KG + remainingKg)
    : 0;

  // On pace only when the trend actually moves toward the goal at a real rate.
  const movingTowardGoal = weekDeltaKg * direction < 0;
  const weeksToGoal = remainingKg / Math.abs(weekDeltaKg);
  const projectedDate =
    hasGoal && movingTowardGoal && Math.abs(weekDeltaKg) >= 0.05 && weeksToGoal <= 104
      ? new Date(now + weeksToGoal * 7 * DAY_MS).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })
      : null;

  return (
    <Card>
      <View style={styles.header}>
        <ThemedText type="micro" themeColor="textSecondary">
          Weight
        </ThemedText>
        {hasGoal && (
          <ThemedText type="sm" themeColor="textSecondary" tabular>
            goal {formatWeight(goalWeightKg, weightUnit)}
          </ThemedText>
        )}
      </View>

      <View style={styles.heroRow}>
        <StatNumber value={formatWeight(weightKg, weightUnit)} size="sm" />
        <ThemedText type="sm" themeColor="textSecondary" tabular>
          {falling ? '▼' : '▲'} {formatDelta(weekDeltaKg, weightUnit)} this week
        </ThemedText>
      </View>

      <Sparkline
        data={series}
        color={colors.primary}
        accessibilityLabel={`Weight over the last 14 days, from ${formatWeight(series[0], weightUnit)} to ${formatWeight(weightKg, weightUnit)}`}
      />
      <ThemedText type="sm" themeColor="textSecondary">
        14-day trend
      </ThemedText>

      {hasGoal && (
        <View style={styles.journey}>
          <ProgressBar fraction={journeyFraction} />
          <View style={styles.journeyLabels}>
            <ThemedText type="sm" themeColor="textSecondary" tabular>
              started {formatWeight(startKg, weightUnit)}
            </ThemedText>
            <ThemedText type="sm" themeColor="textSecondary" tabular>
              {Math.round(journeyFraction * 100)}% there
              {projectedDate ? ` · on pace for ${projectedDate}` : ''}
            </ThemedText>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.s8,
  },
  journey: {
    gap: Spacing.s4,
    marginTop: Spacing.s4,
  },
  journeyLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
