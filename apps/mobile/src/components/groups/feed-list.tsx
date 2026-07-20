import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { groupsApi } from '@/lib/api';
import { leadsWithMeals } from '@/lib/groups';
import { Spacing } from '@/theme';
import type { GroupCategory, GroupFeedResponse } from '@metabolizm/shared';

import { MemberDayCard } from './member-day-card';

type Props = {
  groupId: string;
  category: GroupCategory;
  feed: GroupFeedResponse;
  myUserId: string | null;
  onChanged: () => void;
};

/**
 * The group's day. Members are ordered with the caller first and otherwise in
 * the server's order — a stable sort computed from the response rather than
 * re-ordered in place, since reordering mounted rows crashes Fabric on
 * Android (RN 0.86).
 */
export function FeedList({ groupId, category, feed, myUserId, onChanged }: Props) {
  const router = useRouter();
  const cards = [...feed.cards].sort((a, b) => {
    if (a.userId === myUserId) return -1;
    if (b.userId === myUserId) return 1;
    return 0;
  });

  const react = async (userId: string, date: string, token: string) => {
    try {
      await groupsApi.postInteraction(groupId, {
        subjectUserId: userId,
        subjectDate: date,
        kind: 'reaction',
        emoji: token,
      });
      onChanged();
    } catch {
      // A dropped reaction is not worth an error dialog; the next load
      // reflects the true state.
    }
  };

  if (cards.length === 0) {
    return (
      <ThemedText type="body" themeColor="textSecondary" style={styles.note}>
        No one has joined yet. Share an invite to get started.
      </ThemedText>
    );
  }

  return (
    <View style={styles.list}>
      {cards.map((card) => (
        <MemberDayCard
          key={card.userId}
          card={card}
          category={category}
          isMe={card.userId === myUserId}
          onPress={() =>
            router.push({
              pathname: '/member-day',
              params: { groupId, userId: card.userId, date: card.date },
            })
          }
          onReact={(token) => void react(card.userId, card.date, token)}
        />
      ))}

      <ThemedText type="sm" themeColor="textTertiary" style={styles.note}>
        {leadsWithMeals(category)
          ? 'Family groups lead with meals. Calories and macros stay off unless a member turns them on.'
          : 'Cards show what each member chose to share — nothing more.'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.s16,
  },
  note: {
    textAlign: 'center',
    paddingHorizontal: Spacing.s16,
    paddingTop: Spacing.s8,
  },
});
