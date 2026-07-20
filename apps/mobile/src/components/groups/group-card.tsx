import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CATEGORY_LABEL } from '@/lib/groups';
import { Spacing, useTheme } from '@/theme';
import type { GroupListItemDto } from '@metabolizm/shared';

import { AvatarStack } from './avatar';

type Props = {
  group: GroupListItemDto;
  onPress: () => void;
};

/** A group in the Groups tab list. */
export function GroupCard({ group, onPress }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <Card style={styles.card}>
        <View style={styles.head}>
          <ThemedText type="h3" themeColor="inkStrong" numberOfLines={1} style={styles.name}>
            {group.name}
          </ThemedText>
          <Badge size="sm" variant="outline" label={CATEGORY_LABEL[group.category]} />
        </View>

        <View style={styles.row}>
          <AvatarStack members={group.members} total={group.memberCount} />
          <View style={styles.spacer} />
          {group.myStreak > 0 ? (
            <Badge
              size="sm"
              variant="accent"
              label={`${group.myStreak}-day streak`}
              icon={(color) => (
                <SymbolView
                  name={{ ios: 'flame.fill', android: 'local_fire_department' }}
                  size={11}
                  tintColor={color}
                  fallback={<View />}
                />
              )}
            />
          ) : null}
        </View>

        <View style={styles.footer}>
          {group.unreadCount > 0 ? (
            <View style={styles.unread}>
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              <ThemedText type="sm" themeColor="textSecondary" tabular>
                {`${group.unreadCount} new since you last looked`}
              </ThemedText>
            </View>
          ) : (
            <ThemedText type="sm" themeColor="textTertiary" tabular>
              {`${group.memberCount} ${group.memberCount === 1 ? 'member' : 'members'} · all caught up`}
            </ThemedText>
          )}
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right' }}
            size={14}
            tintColor={colors.textTertiary}
            fallback={<View />}
          />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.s12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s8,
  },
  name: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s8,
  },
  spacer: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.s8,
  },
  unread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pressed: {
    opacity: 0.85,
  },
});
