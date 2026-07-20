import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, View } from 'react-native';

import { FeedList } from '@/components/groups/feed-list';
import { LeaderboardList } from '@/components/groups/leaderboard-list';
import { MembersList } from '@/components/groups/members-list';
import { RosterList } from '@/components/groups/roster-list';
import { GroupScreenHeader } from '@/components/groups/screen-header';
import { Segmented } from '@/components/groups/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconButton } from '@/components/ui/icon-button';
import { useRequest } from '@/hooks/use-request';
import { groupsApi } from '@/lib/api';
import { useCurrentUserId } from '@/lib/auth';
import { CATEGORY_LABEL, inviteLink } from '@/lib/groups';
import { useGroups, useGroupSummary } from '@/store/groups';
import { Spacing, useTheme } from '@/theme';

type TabKey = 'today' | 'leaderboard' | 'members' | 'roster';

/**
 * A group: today's feed, the weekly board, and who shares what. Pushed on the
 * root stack, so it carries its own header rather than the tabs' AppHeader.
 */
export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = id ?? '';
  const router = useRouter();
  const { colors } = useTheme();

  const myUserId = useCurrentUserId();
  const summary = useGroupSummary(groupId);
  const refresh = useGroups((s) => s.refresh);
  const markSeen = useGroups((s) => s.markSeen);

  // Deep-linked or cold start: the list may not be loaded yet.
  useEffect(() => {
    if (!summary) void refresh();
  }, [summary, refresh]);

  useEffect(() => {
    if (groupId) markSeen(groupId);
  }, [groupId, markSeen]);

  const isCoach =
    summary?.category === 'trainer' &&
    (summary.role === 'coach' || summary.role === 'owner');

  const [tab, setTab] = useState<TabKey>(isCoach ? 'roster' : 'today');

  const loadFeed = useCallback(
    (signal: AbortSignal) => groupsApi.getFeed(groupId, undefined, { signal }),
    [groupId],
  );
  const feed = useRequest(loadFeed);
  const reloadFeed = feed.reload;

  // Coming back from the sharing sheet, a member day, or a comment must show
  // the change. Skipped on the first focus, which `useRequest` already covers.
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedBefore.current) {
        focusedBefore.current = true;
        return;
      }
      reloadFeed();
    }, [reloadFeed]),
  );

  const invite = async () => {
    try {
      const { invite: created } = await groupsApi.createInvite(groupId, {
        ttlHours: 168,
      });
      await Share.share({
        message: `Join me on Metabolizm — you'll see exactly what you'd share before joining: ${inviteLink(created.token)}`,
      });
    } catch {
      // Sharing is a convenience; a failure leaves the group untouched.
    }
  };

  const options = tabOptions(isCoach, summary?.category === 'family');
  // The summary can arrive after first paint (deep link or cold start), which
  // changes the tab set — fall back to the first tab rather than leaving a
  // selection that no longer exists.
  const activeTab = options.some((option) => option.value === tab)
    ? tab
    : options[0].value;

  return (
    <ThemedView style={styles.container}>
      <GroupScreenHeader
        title={summary?.name ?? 'Group'}
        subtitle={
          summary
            ? `${CATEGORY_LABEL[summary.category]} · ${summary.memberCount} ${summary.memberCount === 1 ? 'member' : 'members'}`
            : undefined
        }
        action={
          <IconButton
            variant="plain"
            accessibilityLabel="Invite someone"
            onPress={() => void invite()}
            icon={(color) => (
              <SymbolView
                name={{ ios: 'person.badge.plus', android: 'person_add' }}
                size={20}
                tintColor={color}
                fallback={<View />}
              />
            )}
          />
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Segmented options={options} value={activeTab} onChange={setTab} />

        {feed.loading && !feed.data ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : feed.error || !feed.data ? (
          <ThemedText type="body" themeColor="dangerText">
            {feed.error ?? 'Could not load this group.'}
          </ThemedText>
        ) : (
          <>
            {activeTab === 'today' ? (
              <FeedList
                groupId={groupId}
                category={summary?.category ?? 'friends'}
                feed={feed.data}
                myUserId={myUserId}
                onChanged={feed.reload}
              />
            ) : null}

            {activeTab === 'roster' ? <RosterList groupId={groupId} /> : null}

            {activeTab === 'leaderboard' ? (
              <LeaderboardList groupId={groupId} myUserId={myUserId} />
            ) : null}

            {activeTab === 'members' ? (
              <MembersList
                feed={feed.data}
                myUserId={myUserId}
                onEditSharing={() =>
                  router.push({ pathname: '/group-sharing', params: { groupId } })
                }
                onInvite={() => void invite()}
              />
            ) : null}
          </>
        )}

        <ThemedText
          type="sm"
          themeColor="textTertiary"
          style={[styles.footer, { borderTopColor: colors.border }]}>
          You control what this group sees, per group, any time.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

/** Family leads with meals; a coach lands on the roster rather than a feed. */
function tabOptions(
  isCoach: boolean,
  isFamily: boolean,
): { value: TabKey; label: string }[] {
  if (isCoach) {
    return [
      { value: 'roster', label: 'Clients' },
      { value: 'leaderboard', label: 'Consistency' },
      { value: 'members', label: 'Sharing' },
    ];
  }
  return [
    { value: 'today', label: isFamily ? 'Meals' : 'Today' },
    { value: 'leaderboard', label: 'Leaderboard' },
    { value: 'members', label: 'Members' },
  ];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.s20,
    paddingBottom: Spacing.s48,
    gap: Spacing.s16,
  },
  center: {
    paddingVertical: Spacing.s48,
    alignItems: 'center',
  },
  footer: {
    textAlign: 'center',
    paddingTop: Spacing.s16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
