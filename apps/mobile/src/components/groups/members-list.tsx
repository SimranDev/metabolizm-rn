import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { shareSummary } from '@/lib/groups';
import { Spacing } from '@/theme';
import type { GroupFeedResponse } from '@metabolizm/shared';

import { Avatar } from './avatar';

type Props = {
  feed: GroupFeedResponse;
  myUserId: string | null;
  onEditSharing: () => void;
  onInvite: () => void;
};

/**
 * Who's in the group and what each of them shares.
 *
 * Built from the feed's `shared` configs: the API has no members endpoint yet,
 * so role and join date aren't available here (nor, therefore, the owner's
 * remove/transfer controls). Every member's sharing IS shown, which is the
 * point of the screen — you can always see what others can see of you.
 */
export function MembersList({ feed, myUserId, onEditSharing, onInvite }: Props) {
  return (
    <View style={styles.list}>
      {feed.cards.map((card) => {
        const mine = card.userId === myUserId;
        return (
          <Card key={card.userId} style={styles.card}>
            <View style={styles.head}>
              <Avatar name={card.name} image={card.image} size={36} />
              <View style={styles.identity}>
                <ThemedText type="smBold" numberOfLines={1}>
                  {mine ? `You · ${card.name}` : card.name}
                </ThemedText>
                <ThemedText type="sm" themeColor="textTertiary">
                  {mine ? 'Your sharing in this group' : 'Shares with this group'}
                </ThemedText>
              </View>
              {mine ? (
                <Button label="Edit sharing" variant="ghost" size="sm" onPress={onEditSharing} />
              ) : null}
            </View>

            <View style={styles.chips}>
              {shareSummary(card.shared).map((chip) => (
                <Badge key={chip} size="sm" variant="neutral" label={chip} />
              ))}
            </View>
          </Card>
        );
      })}

      <Button
        label="Invite someone"
        variant="secondary"
        onPress={onInvite}
        fullWidth
      />

      <ThemedText type="sm" themeColor="textTertiary">
        Everyone sees the same list, so sharing is never a secret arrangement.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.s12,
  },
  card: {
    gap: Spacing.s12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s12,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.s8,
  },
});
