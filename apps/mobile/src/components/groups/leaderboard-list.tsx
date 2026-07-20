import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { useRequest } from '@/hooks/use-request';
import { groupsApi } from '@/lib/api';
import { elapsedDays, weekRangeLabel } from '@/lib/groups';
import { Spacing, useTheme } from '@/theme';

import { LeaderboardRow } from './leaderboard-row';

type Props = {
  groupId: string;
  myUserId: string | null;
};

/** Weekly consistency board. */
export function LeaderboardList({ groupId, myUserId }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const load = useCallback(
    (signal: AbortSignal) => groupsApi.getLeaderboard(groupId, undefined, { signal }),
    [groupId],
  );
  const { data, loading, error } = useRequest(load);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error || !data) {
    return (
      <ThemedText type="body" themeColor="dangerText">
        {error ?? 'Could not load the leaderboard.'}
      </ThemedText>
    );
  }

  const elapsed = elapsedDays(data.weekStart, data.weekEnd);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <ThemedText type="micro" themeColor="textTertiary">
          {`This week · ${weekRangeLabel(data.weekStart, data.weekEnd)}`}
        </ThemedText>
        <ThemedText type="sm" themeColor="textSecondary">
          Weekly consistency
        </ThemedText>
      </View>

      <Card style={styles.card}>
        {data.entries.map((entry, index) => (
          <View
            key={entry.userId}
            style={
              index > 0
                ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }
                : null
            }>
            <LeaderboardRow
              entry={entry}
              elapsed={elapsed}
              isMe={entry.userId === myUserId}
              onPress={() =>
                router.push({
                  pathname: '/member-day',
                  params: { groupId, userId: entry.userId, date: data.weekEnd },
                })
              }
            />
          </View>
        ))}
      </Card>

      <ThemedText type="sm" themeColor="textTertiary" style={styles.note}>
        Ranking is consistency against each member&apos;s own targets — cut, bulk and
        maintain compare fairly. Calories and weight never enter the score. Days not
        logged count as zero, so a week that has only just started reads low.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.s12,
  },
  head: {
    gap: 2,
  },
  card: {
    paddingVertical: 0,
  },
  center: {
    paddingVertical: Spacing.s48,
    alignItems: 'center',
  },
  note: {
    paddingHorizontal: Spacing.s4,
  },
});
