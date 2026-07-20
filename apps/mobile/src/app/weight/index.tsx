import type { WeightRange } from '@metabolizm/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Segmented } from '@/components/ui/segmented';
import { StatNumber } from '@/components/ui/stat-number';
import { HistoryRow } from '@/components/vitals/history-row';
import { LogWeightSheet } from '@/components/vitals/log-weight-sheet';
import { WeightChart } from '@/components/vitals/weight-chart';
import { useWeightSeries } from '@/hooks/use-weight-series';
import {
  formatShortDate,
  formatTrend,
  formatWeight,
  formatWeightValue,
  localDateKey,
  RANGE_OPTIONS,
  trendCaption,
  WEIGHT_UNIT_OPTIONS,
} from '@/lib/weight';
import { useWeight } from '@/store/weight';
import { Spacing, useTheme } from '@/theme';

const INLINE_HISTORY_COUNT = 8;

/**
 * Weight detail: hero, journey to goal, the chart, and a preview of history.
 *
 * Pushes at the ROOT stack so it carries its own ScreenHeader rather than the
 * tabs' persistent AppHeader.
 */
export default function WeightScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [range, setRange] = useState<WeightRange>('3M');
  const [logOpen, setLogOpen] = useState(false);

  const unit = useWeight((s) => s.unit);
  const setUnit = useWeight((s) => s.setUnit);
  const entries = useWeight((s) => s.entries);
  const refreshStore = useWeight((s) => s.refresh);

  const { data, loading, error, reload } = useWeightSeries(range);

  // Skip the first focus — useRequest already covers the initial load.
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedBefore.current) {
        focusedBefore.current = true;
        return;
      }
      reload();
    }, [reload]),
  );

  const stats = data?.stats;
  const goal = data?.goal ?? null;

  // Captured once per mount so the caption doesn't reshuffle on every render.
  const [mountedAt] = useState(() => new Date());
  const caption = useMemo(
    () => trendCaption(stats?.trendKgPerWeek ?? null, mountedAt),
    [stats?.trendKgPerWeek, mountedAt],
  );

  const recent = entries.slice(0, INLINE_HISTORY_COUNT);
  const todayKey = localDateKey();

  const trendLabel = formatTrend(stats?.trendKgPerWeek ?? null, unit);
  const toGoKg =
    stats?.currentKg != null && goal
      ? Math.max(0, Math.abs(stats.currentKg - goal.targetWeightKg))
      : null;

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="Weight"
        action={
          <View style={styles.unitToggle}>
            <Segmented options={WEIGHT_UNIT_OPTIONS} value={unit} onChange={setUnit} />
          </View>
        }
      />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} />
      ) : error && !data ? (
        <View style={styles.content}>
          <ThemedText type="body" themeColor="dangerText">
            {error}
          </ThemedText>
          <Button label="Try again" onPress={reload} variant="secondary" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Hero */}
          <View style={styles.hero}>
            {stats?.currentKg != null ? (
              <View style={styles.heroRow}>
                <StatNumber value={formatWeightValue(stats.currentKg, unit)} size="md" />
                <ThemedText type="h3" themeColor="textSecondary">
                  {unit}
                </ThemedText>
                {trendLabel && (
                  <View style={[styles.trendPill, { backgroundColor: colors.surfaceSunken }]}>
                    <ThemedText type="sm" themeColor="inkStrong" tabular>
                      {trendLabel}
                    </ThemedText>
                  </View>
                )}
              </View>
            ) : (
              <ThemedText type="h2" themeColor="textSecondary">
                No weigh-ins yet
              </ThemedText>
            )}
            <ThemedText type="body" themeColor="textSecondary">
              {caption}
            </ThemedText>
          </View>

          {/* Stat chips */}
          <View style={styles.chips}>
            <Chip label="CURRENT" value={value(stats?.currentKg, unit)} />
            <Chip label="GOAL" value={value(goal?.targetWeightKg, unit)} />
            <Chip label="TO GO" value={value(toGoKg, unit)} highlight />
            <Chip
              label="STREAK"
              value={stats ? `${stats.streakDays} d` : '—'}
            />
          </View>

          {/* Journey */}
          {goal && stats?.progressPct !== null && stats?.progressPct !== undefined ? (
            <Card>
              <View style={styles.journeyHead}>
                <ThemedText type="smBold" themeColor="inkStrong">
                  Journey to goal
                </ThemedText>
                <ThemedText type="sm" themeColor="textSecondary" tabular>
                  {stats.progressPct}% there
                </ThemedText>
              </View>
              <ProgressBar fraction={stats.progressPct / 100} />
              <ThemedText type="sm" themeColor="textTertiary" tabular>
                started {formatWeight(goal.startingWeightKg, unit)}
                {stats.projectedGoalDate
                  ? ` · on pace for ${formatShortDate(stats.projectedGoalDate)}`
                  : ''}
              </ThemedText>
            </Card>
          ) : null}

          {/* Range + chart */}
          <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
          <Card>
            <WeightChart
              points={data?.points ?? []}
              unit={unit}
              goalKg={goal?.targetWeightKg ?? null}
              bucket={data?.bucket ?? 'day'}
            />
          </Card>

          {/* Averages */}
          {stats && (
            <View style={styles.chips}>
              <Chip label="7-DAY AVG" value={value(stats.avg7Kg, unit)} />
              <Chip label="30-DAY AVG" value={value(stats.avg30Kg, unit)} />
              <Chip label="SINCE START" value={value(stats.sinceStartKg, unit, true)} />
            </View>
          )}

          {/* History preview */}
          <View style={styles.historyHead}>
            <ThemedText type="h3" themeColor="inkStrong">
              History
            </ThemedText>
            {entries.length > 0 && (
              <ThemedText
                type="link"
                onPress={() => router.push('/weight/history')}
                accessibilityRole="link">
                See all
              </ThemedText>
            )}
          </View>

          {recent.length === 0 ? (
            <ThemedText type="body" themeColor="textSecondary">
              Nothing logged yet. Your first weigh-in starts the trend.
            </ThemedText>
          ) : (
            recent.map((entry, i) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                unit={unit}
                previous={recent[i + 1] ?? null}
                isToday={entry.entryDate === todayKey}
              />
            ))
          )}
        </ScrollView>
      )}

      <View style={styles.fab}>
        <Button label="Log weight" onPress={() => setLogOpen(true)} size="lg" fullWidth />
      </View>

      <LogWeightSheet
        visible={logOpen}
        onClose={() => {
          setLogOpen(false);
          void refreshStore();
          reload();
        }}
        prefillKg={entries[0]?.weightKg ?? null}
      />
    </ThemedView>
  );
}

/** Renders the value or an em dash — never a fabricated zero. */
function value(kg: number | null | undefined, unit: string, signed = false): string {
  if (kg === null || kg === undefined) return '—';
  const body = formatWeightValue(Math.abs(kg), unit as never);
  if (!signed) return body;
  return `${kg < 0 ? '▼' : '▲'} ${body}`;
}

function Chip({
  label,
  value: text,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: highlight ? colors.surfaceSunken : colors.surface, borderColor: colors.border },
      ]}>
      <ThemedText type="micro" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="h3" themeColor="inkStrong" tabular>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    marginTop: Spacing.s48,
  },
  content: {
    padding: Spacing.s20,
    paddingBottom: Spacing.s64 + Spacing.s48,
    gap: Spacing.s16,
  },
  unitToggle: {
    width: 132,
  },
  hero: {
    gap: Spacing.s4,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.s8,
    flexWrap: 'wrap',
  },
  trendPill: {
    paddingHorizontal: Spacing.s8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.s8,
  },
  chip: {
    flexBasis: '22%',
    flexGrow: 1,
    gap: 2,
    padding: Spacing.s12,
    borderRadius: 10,
    borderWidth: 1,
  },
  journeyHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  historyHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: Spacing.s8,
  },
  fab: {
    position: 'absolute',
    left: Spacing.s20,
    right: Spacing.s20,
    bottom: Spacing.s32,
  },
});
