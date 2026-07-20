import type { WeightEntryDto, WeightMilestone } from '@metabolizm/shared';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Segmented } from '@/components/ui/segmented';
import { HistoryRow, MilestoneRow } from '@/components/vitals/history-row';
import { useWeightSeries } from '@/hooks/use-weight-series';
import { formatShortDate, formatWeightValue, localDateKey } from '@/lib/weight';
import { useWeight } from '@/store/weight';
import { Spacing, useTheme } from '@/theme';

type Filter = 'all' | 'milestones' | 'notes';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'milestones', label: 'Milestones' },
  { value: 'notes', label: 'Notes' },
] as const satisfies readonly { value: Filter; label: string }[];

type Row =
  | { kind: 'entry'; entry: WeightEntryDto; previous: WeightEntryDto | null }
  | { kind: 'milestone'; id: string; milestone: WeightMilestone };

const milestoneKey = (m: WeightMilestone) => `${m.kind}-${m.date}-${m.valueKg}`;

/**
 * Full weight history. Milestones are interleaved by date rather than living
 * in their own list, so the story reads chronologically: the weigh-ins and the
 * moments they produced in one column.
 */
export default function WeightHistoryScreen() {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [undo, setUndo] = useState<WeightEntryDto | null>(null);

  const unit = useWeight((s) => s.unit);
  const entries = useWeight((s) => s.entries);
  const removeEntry = useWeight((s) => s.removeEntry);
  const restoreEntry = useWeight((s) => s.restoreEntry);

  // The ALL series carries every milestone the history could reference.
  const { data } = useWeightSeries('ALL');
  const milestones = useMemo(() => data?.milestones ?? [], [data]);
  const stats = data?.stats;
  const todayKey = localDateKey();

  const rows = useMemo<Row[]>(() => {
    if (filter === 'milestones') {
      return milestones.map((m) => ({
        kind: 'milestone' as const,
        id: milestoneKey(m),
        milestone: m,
      }));
    }

    // Position within the FULL list, so filtering can't invent a delta by
    // pairing two rows that weren't actually consecutive weigh-ins.
    const positionById = new Map(entries.map((e, i) => [e.id, i]));
    const visible =
      filter === 'notes' ? entries.filter((e) => e.note !== null) : entries;
    const entryRows: Row[] = visible.map((entry) => ({
      kind: 'entry' as const,
      entry,
      previous: entries[(positionById.get(entry.id) ?? 0) + 1] ?? null,
    }));

    if (filter === 'notes') return entryRows;

    // Interleave milestones by date, newest first.
    const milestoneRows: Row[] = milestones.map((m) => ({
      kind: 'milestone' as const,
      id: milestoneKey(m),
      milestone: m,
    }));
    return [...entryRows, ...milestoneRows].sort((a, b) => {
      const da = a.kind === 'entry' ? a.entry.entryDate : a.milestone.date;
      const db = b.kind === 'entry' ? b.entry.entryDate : b.milestone.date;
      return db.localeCompare(da);
    });
  }, [filter, entries, milestones]);

  const onDelete = useCallback(
    (entry: WeightEntryDto) => {
      setUndo(entry);
      void removeEntry(entry.id);
    },
    [removeEntry],
  );

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="Weight"
        subtitle={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
        action={
          stats?.projectedGoalDate ? (
            <ThemedText type="sm" themeColor="textSecondary" numberOfLines={1}>
              on pace for {formatShortDate(stats.projectedGoalDate)}
            </ThemedText>
          ) : undefined
        }
      />

      <FlatList
        data={rows}
        keyExtractor={(row) => (row.kind === 'entry' ? row.entry.id : row.id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Segmented options={FILTERS} value={filter} onChange={setFilter} />
            {stats && (
              <View style={styles.summaryRow}>
                <Summary label="7-DAY AVG" value={fmt(stats.avg7Kg, unit)} />
                <Summary label="30-DAY AVG" value={fmt(stats.avg30Kg, unit)} />
                <Summary
                  label="SINCE START"
                  value={
                    stats.sinceStartKg === null
                      ? '—'
                      : `${stats.sinceStartKg < 0 ? '▼' : '▲'} ${fmt(Math.abs(stats.sinceStartKg), unit)}`
                  }
                />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <ThemedText type="body" themeColor="textSecondary" style={styles.empty}>
            {filter === 'milestones'
              ? 'No milestones yet — they appear as you cross them.'
              : filter === 'notes'
                ? 'No weigh-ins with notes yet.'
                : 'Nothing logged yet.'}
          </ThemedText>
        }
        renderItem={({ item }) =>
          item.kind === 'milestone' ? (
            <MilestoneRow milestone={item.milestone} unit={unit} />
          ) : (
            <Pressable
              onLongPress={() => onDelete(item.entry)}
              delayLongPress={400}
              accessibilityHint="Long press to delete this weigh-in">
              <HistoryRow
                entry={item.entry}
                unit={unit}
                previous={item.previous}
                isToday={item.entry.entryDate === todayKey}
              />
            </Pressable>
          )
        }
      />

      {undo && (
        <Card style={[styles.undo, { borderColor: colors.border }]}>
          <ThemedText type="sm" themeColor="text" style={styles.undoText}>
            Weigh-in deleted
          </ThemedText>
          <ThemedText
            type="link"
            accessibilityRole="button"
            onPress={() => {
              void restoreEntry(undo);
              setUndo(null);
            }}>
            Undo
          </ThemedText>
          <ThemedText
            type="sm"
            themeColor="textTertiary"
            accessibilityRole="button"
            onPress={() => setUndo(null)}>
            Dismiss
          </ThemedText>
        </Card>
      )}
    </ThemedView>
  );
}

const fmt = (kg: number | null, unit: Parameters<typeof formatWeightValue>[1]) =>
  kg === null ? '—' : `${formatWeightValue(kg, unit)} ${unit}`;

function Summary({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.summary, { backgroundColor: colors.surfaceSunken }]}>
      <ThemedText type="micro" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smBold" themeColor="inkStrong" tabular>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.s20,
    paddingBottom: Spacing.s48,
  },
  header: {
    gap: Spacing.s12,
    paddingVertical: Spacing.s16,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.s8,
  },
  summary: {
    flex: 1,
    gap: 2,
    padding: Spacing.s12,
    borderRadius: 10,
  },
  empty: {
    paddingVertical: Spacing.s32,
    textAlign: 'center',
  },
  undo: {
    position: 'absolute',
    left: Spacing.s20,
    right: Spacing.s20,
    bottom: Spacing.s32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s16,
  },
  undoText: {
    flex: 1,
  },
});
