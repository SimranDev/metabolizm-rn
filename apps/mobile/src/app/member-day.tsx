import { useLocalSearchParams } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { AdherenceRing } from '@/components/groups/adherence-ring';
import { CommentThread } from '@/components/groups/comment-thread';
import { MacroLines } from '@/components/groups/macro-lines';
import { HitChip } from '@/components/groups/member-day-card';
import { LockNote, NotSharedChip } from '@/components/groups/not-shared';
import { GroupScreenHeader } from '@/components/groups/screen-header';
import { ProgressBar } from '@/components/dashboard/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useRequest } from '@/hooks/use-request';
import { groupsApi } from '@/lib/api';
import { useCurrentUserId } from '@/lib/auth';
import { localDateKey } from '@/lib/groups';
import { useGroupSummary } from '@/store/groups';
import { Spacing, useTheme } from '@/theme';
import type { GroupMemberDayCardDto, MaskedDiaryEntryDto } from '@metabolizm/shared';

/**
 * One member's day.
 *
 * This is where the masking contract is most visible: for every dimension the
 * member could share, either their data or a designed "not shared" chip is
 * rendered — never an empty slot, and never a zero standing in for a value the
 * API withheld.
 */
export default function MemberDayScreen() {
  const { groupId = '', userId = '', date } = useLocalSearchParams<{
    groupId?: string;
    userId?: string;
    date?: string;
  }>();
  const day = date ?? localDateKey();

  const myUserId = useCurrentUserId();
  const summary = useGroupSummary(groupId);

  const load = useCallback(
    (signal: AbortSignal) => groupsApi.getMemberDay(groupId, userId, day, { signal }),
    [groupId, userId, day],
  );
  const { data, loading, error, reload } = useRequest(load);

  // Trainer groups keep comments to the coach; everyone else may comment.
  const canComment =
    summary?.category !== 'trainer' ||
    summary.role === 'coach' ||
    summary.role === 'owner';

  const postComment = async (body: string) => {
    await groupsApi.postInteraction(groupId, {
      subjectUserId: userId,
      subjectDate: day,
      kind: 'comment',
      body,
    });
    reload();
  };

  const card = data?.card;
  const isMe = card?.userId === myUserId;

  return (
    <ThemedView style={styles.container}>
      <GroupScreenHeader
        title={card ? (isMe ? 'You' : card.name) : 'Member'}
        subtitle={summary ? `${summary.name} · ${dayLabel(day)}` : dayLabel(day)}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && !data ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : error || !card ? (
          <ThemedText type="body" themeColor="dangerText">
            {error ?? 'This member is no longer in the group.'}
          </ThemedText>
        ) : (
          <>
            <Summary card={card} />
            <Calories card={card} />
            <Macros card={card} />
            <Meals card={card} entries={data?.entries} />
            <WeightTrend card={card} />

            <View style={styles.section}>
              <ThemedText type="micro" themeColor="textTertiary">
                Comments
              </ThemedText>
              <CommentThread
                comments={card.comments}
                myUserId={myUserId}
                onSend={canComment ? postComment : null}
                placeholder={`Comment on ${isMe ? 'your' : `${card.name}'s`} day…`}
                disabledNote="Only the coach comments in a trainer group. Reactions are open to everyone."
              />
            </View>

            <ThemedText type="sm" themeColor="textTertiary" style={styles.footer}>
              {isMe
                ? 'This is exactly what the group sees of your day.'
                : `${card.name} controls what appears here — per group, any time.`}
            </ThemedText>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

/** Headline: adherence when shared, otherwise just whether they logged. */
function Summary({ card }: { card: GroupMemberDayCardDto }) {
  const flags = card.adherence;
  const checks = flags
    ? [flags.caloriesInRange, flags.proteinHit, flags.carbsInRange, flags.fatInRange].filter(
        (v): v is boolean => v !== null,
      )
    : [];
  const met = checks.filter(Boolean).length;

  return (
    <Card style={styles.summary}>
      {checks.length > 0 ? (
        <AdherenceRing
          fraction={met / checks.length}
          label={`${met}/${checks.length}`}
          size={64}
        />
      ) : null}
      <View style={styles.summaryText}>
        <ThemedText type="h3" themeColor="inkStrong">
          {card.logged ? 'Logged today' : 'Nothing logged yet'}
        </ThemedText>
        {checks.length > 0 ? (
          <ThemedText type="sm" themeColor="textSecondary" tabular>
            {`${met} of ${checks.length} targets hit`}
          </ThemedText>
        ) : null}
        {card.mealsLogged !== undefined ? (
          <ThemedText type="sm" themeColor="textSecondary" tabular>
            {`${card.mealsLogged} ${card.mealsLogged === 1 ? 'meal' : 'meals'} logged`}
          </ThemedText>
        ) : null}
        {card.streak !== undefined && card.streak > 0 ? (
          <View style={styles.badgeRow}>
            <Badge size="sm" variant="accent" label={`${card.streak}-day streak`} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function Calories({ card }: { card: GroupMemberDayCardDto }) {
  if (card.adherence && !card.calories) {
    // adherenceOnly: the hit/miss flag is the shared form of this dimension.
    return card.adherence.caloriesInRange !== null ? (
      <Section title="Calories">
        <HitChip
          label={card.adherence.caloriesInRange ? 'In range' : 'Outside range'}
          hit={card.adherence.caloriesInRange}
        />
        <LockNote>Totals not shared — hit or missed only</LockNote>
      </Section>
    ) : (
      <NotSharedChip label="Calories" />
    );
  }
  if (!card.calories) return <NotSharedChip label="Calories" />;

  const { consumedKcal, targetKcal } = card.calories;
  return (
    <Section title="Calories">
      <ThemedText type="statSm" tabular>
        {targetKcal
          ? `${Math.round(consumedKcal).toLocaleString()} / ${Math.round(targetKcal).toLocaleString()}`
          : Math.round(consumedKcal).toLocaleString()}
      </ThemedText>
      {targetKcal ? <ProgressBar fraction={consumedKcal / targetKcal} /> : null}
    </Section>
  );
}

function Macros({ card }: { card: GroupMemberDayCardDto }) {
  if (card.adherence && !card.macros) {
    const flags = card.adherence;
    const items = [
      { label: 'Protein', value: flags.proteinHit },
      { label: 'Carbs', value: flags.carbsInRange },
      { label: 'Fat', value: flags.fatInRange },
    ].filter((item): item is { label: string; value: boolean } => item.value !== null);
    return items.length > 0 ? (
      <Section title="Macros">
        <View style={styles.chips}>
          {items.map((item) => (
            <HitChip key={item.label} label={item.label} hit={item.value} />
          ))}
        </View>
        <LockNote>Grams not shared — hit or missed only</LockNote>
      </Section>
    ) : (
      <NotSharedChip label="Macros" />
    );
  }
  if (!card.macros) return <NotSharedChip label="Macros" />;

  const m = card.macros;
  return (
    <Section title="Macros">
      <MacroLines
        lines={[
          { macro: 'protein', label: 'Protein', grams: m.proteinG, target: m.targetProteinG },
          { macro: 'carbs', label: 'Carbs', grams: m.carbsG, target: m.targetCarbsG },
          { macro: 'fat', label: 'Fat', grams: m.fatG, target: m.targetFatG },
        ]}
      />
    </Section>
  );
}

function Meals({
  card,
  entries,
}: {
  card: GroupMemberDayCardDto;
  entries?: MaskedDiaryEntryDto[];
}) {
  // `entries` is absent unless the member shares full meal detail — an empty
  // array means they share it and simply haven't logged, which is not the
  // same as withholding it.
  if (entries) {
    return (
      <Section title="Meals">
        {entries.length === 0 ? (
          <ThemedText type="body" themeColor="textTertiary">
            No meals logged yet
          </ThemedText>
        ) : (
          entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)
        )}
      </Section>
    );
  }
  if (card.mealNames) {
    return (
      <Section title="Meals">
        {card.mealNames.length === 0 ? (
          <ThemedText type="body" themeColor="textTertiary">
            No meals named yet
          </ThemedText>
        ) : (
          card.mealNames.map((name) => (
            <ThemedText key={name} type="body">
              {name}
            </ThemedText>
          ))
        )}
        <LockNote>Ingredients and portions not shared</LockNote>
      </Section>
    );
  }
  return <NotSharedChip label="Meals" />;
}

function EntryRow({ entry }: { entry: MaskedDiaryEntryDto }) {
  const { colors } = useTheme();
  // Per-entry numbers depend on the member's calorie/macro toggles too, so
  // each is rendered only when present.
  const numbers = [
    entry.energyKcal !== undefined ? `${Math.round(entry.energyKcal)} kcal` : null,
    entry.proteinG !== undefined ? `${Math.round(entry.proteinG)}p` : null,
    entry.carbsG !== undefined ? `${Math.round(entry.carbsG)}c` : null,
    entry.fatG !== undefined ? `${Math.round(entry.fatG)}f` : null,
  ].filter((v): v is string => v !== null);

  return (
    <View style={[styles.entry, { borderTopColor: colors.border }]}>
      <View style={styles.entryText}>
        <ThemedText type="smBold" numberOfLines={1}>
          {entry.name}
        </ThemedText>
        <ThemedText type="sm" themeColor="textTertiary" tabular>
          {[capitalize(entry.meal), entry.servingLabel, timeLabel(entry.loggedAt)]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
      </View>
      {numbers.length > 0 ? (
        <ThemedText type="sm" themeColor="textSecondary" tabular>
          {numbers.join(' · ')}
        </ThemedText>
      ) : null}
    </View>
  );
}

function WeightTrend({ card }: { card: GroupMemberDayCardDto }) {
  if (!card.weightTrend) return <NotSharedChip label="Weight trend" />;
  const { direction, deltaKg } = card.weightTrend;
  if (direction === null) {
    return (
      <Section title="Weight trend">
        <ThemedText type="body" themeColor="textTertiary">
          Not enough weigh-ins this week
        </ThemedText>
      </Section>
    );
  }
  return (
    <Section title="Weight trend">
      <ThemedText type="h3" tabular>
        {deltaKg != null
          ? `${direction === 'up' ? '+' : direction === 'down' ? '−' : ''}${Math.abs(deltaKg).toFixed(1)} kg`
          : capitalize(direction)}
      </ThemedText>
      {deltaKg == null ? <LockNote>Direction only — no numbers shared</LockNote> : null}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card style={styles.section}>
      <ThemedText type="micro" themeColor="textTertiary">
        {title}
      </ThemedText>
      {children}
    </Card>
  );
}

const capitalize = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

const timeLabel = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

function dayLabel(date: string): string {
  if (date === localDateKey()) return 'Today';
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.s20,
    paddingBottom: Spacing.s48,
    gap: Spacing.s12,
  },
  center: {
    paddingVertical: Spacing.s48,
    alignItems: 'center',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s16,
  },
  summaryText: {
    flex: 1,
    gap: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: Spacing.s4,
  },
  section: {
    gap: Spacing.s8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.s8,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.s12,
    paddingTop: Spacing.s8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  entryText: {
    flex: 1,
    gap: 2,
  },
  footer: {
    textAlign: 'center',
    paddingTop: Spacing.s8,
  },
});
