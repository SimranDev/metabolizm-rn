import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { useRequest } from '@/hooks/use-request';
import { groupsApi } from '@/lib/api';
import { localDateKey } from '@/lib/groups';
import { Spacing, useTheme } from '@/theme';

import { RosterLegend, RosterRow } from './roster-row';

/**
 * Coach view of a trainer group: every client's 7-day compliance, worst first
 * so the people who need attention are at the top.
 */
export function RosterList({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { colors } = useTheme();

  const load = useCallback(
    (signal: AbortSignal) => groupsApi.getRoster(groupId, { signal }),
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
        {error ?? 'Could not load the roster.'}
      </ThemedText>
    );
  }
  if (data.clients.length === 0) {
    return (
      <ThemedText type="body" themeColor="textSecondary">
        No clients yet. Share an invite to add one.
      </ThemedText>
    );
  }

  const rank = { 'off-track': 0, slipping: 1, 'on-track': 2 } as const;
  const clients = [...data.clients].sort(
    (a, b) =>
      rank[a.bucket] - rank[b.bucket] ||
      (a.adherence7dPct ?? 0) - (b.adherence7dPct ?? 0),
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <ThemedText type="micro" themeColor="textTertiary">
          Needs attention first · last 7 days
        </ThemedText>
        <RosterLegend />
      </View>

      <Card style={styles.card}>
        {clients.map((client, index) => (
          <View
            key={client.userId}
            style={
              index > 0
                ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }
                : null
            }>
            <RosterRow
              client={client}
              onPress={() =>
                router.push({
                  pathname: '/member-day',
                  params: {
                    groupId,
                    userId: client.userId,
                    date: client.days[client.days.length - 1]?.date ?? localDateKey(),
                  },
                })
              }
            />
          </View>
        ))}
      </Card>

      <ThemedText type="sm" themeColor="textTertiary">
        Clients share full compliance detail with you only — never with each other.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.s12,
  },
  head: {
    gap: Spacing.s8,
  },
  card: {
    paddingVertical: 0,
  },
  center: {
    paddingVertical: Spacing.s48,
    alignItems: 'center',
  },
});
