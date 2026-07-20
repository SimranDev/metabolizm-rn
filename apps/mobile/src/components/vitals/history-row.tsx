import type { WeightEntryDto, WeightMilestone, WeightUnit } from '@metabolizm/shared';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { formatDelta, formatLoggedAt, formatShortDate, formatWeightValue, milestoneLabel, trendArrow } from '@/lib/weight';
import { Radius, Spacing, useTheme } from '@/theme';

type EntryProps = {
  entry: WeightEntryDto;
  unit: WeightUnit;
  /** The next-older entry, for the delta pill. Null for the oldest row. */
  previous: WeightEntryDto | null;
  isToday: boolean;
};

/** One weigh-in: date chip, weekday and time, note, weight, delta pill. */
export function HistoryRow({ entry, unit, previous, isToday }: EntryProps) {
  const { colors } = useTheme();
  const delta = previous ? entry.weightKg - previous.weightKg : null;
  const date = new Date(`${entry.entryDate}T00:00:00`);

  return (
    <View style={styles.row}>
      <View style={[styles.dateChip, { backgroundColor: colors.surfaceSunken }]}>
        <ThemedText type="smBold" themeColor="inkStrong" tabular>
          {date.getDate()}
        </ThemedText>
        <ThemedText type="micro" themeColor="textTertiary">
          {date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}
        </ThemedText>
      </View>

      <View style={styles.detail}>
        <ThemedText type="body" themeColor="inkStrong" numberOfLines={1}>
          {isToday ? `Today · ${timeOf(entry.loggedAt)}` : formatLoggedAt(entry.loggedAt)}
        </ThemedText>
        {entry.note ? (
          <ThemedText type="sm" themeColor="textSecondary" numberOfLines={1}>
            {entry.note}
          </ThemedText>
        ) : null}
      </View>

      <ThemedText type="body" themeColor="primary" tabular>
        {formatWeightValue(entry.weightKg, unit)}
      </ThemedText>

      {delta === null || Math.abs(delta) < 0.005 ? (
        <View style={styles.deltaSpacer} />
      ) : (
        <View style={[styles.delta, { backgroundColor: colors.surfaceSunken }]}>
          <ThemedText type="micro" themeColor="textSecondary" tabular>
            {trendArrow(delta)} {formatDelta(delta, unit)}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

/** A milestone, styled distinctly so it reads as an event, not a measurement. */
export function MilestoneRow({
  milestone,
  unit,
}: {
  milestone: WeightMilestone;
  unit: WeightUnit;
}) {
  const { colors } = useTheme();

  return (
    // Sunken fill rather than a lime wash: `accent` as a background is
    // reserved for the active nav item, and there is no accentSoft token.
    <View style={[styles.row, styles.milestone, { backgroundColor: colors.surfaceSunken }]}>
      <View style={[styles.dateChip, { backgroundColor: colors.surface }]}>
        <SymbolView
          name={{ ios: 'flag.fill', android: 'flag' }}
          size={16}
          tintColor={colors.accentText}
          fallback={<View />}
        />
      </View>
      <View style={styles.detail}>
        <ThemedText type="body" themeColor="inkStrong" numberOfLines={1}>
          {milestoneLabel(milestone, unit)}
        </ThemedText>
        <ThemedText type="sm" themeColor="textSecondary">
          {formatShortDate(milestone.date)}
        </ThemedText>
      </View>
      <ThemedText type="micro" themeColor="accentText">
        MILESTONE
      </ThemedText>
    </View>
  );
}

const timeOf = (iso: string) =>
  new Date(iso)
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .toLowerCase();

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s12,
    paddingVertical: Spacing.s12,
  },
  milestone: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.s12,
  },
  dateChip: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detail: {
    flex: 1,
    gap: 2,
  },
  delta: {
    paddingHorizontal: Spacing.s8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    minWidth: 56,
    alignItems: 'center',
  },
  deltaSpacer: {
    minWidth: 56,
  },
});
