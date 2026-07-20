import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { GroupCard } from '@/components/groups/group-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { useGroups } from '@/store/groups';
import { BottomTabInset, Radius, Spacing, useTheme } from '@/theme';

/**
 * Groups tab — private accountability circles. The list is served from the
 * persisted store so it paints instantly, then refreshes whenever the tab
 * regains focus (joining or leaving happens on other routes).
 */
export default function GroupsScreen() {
  const router = useRouter();
  const groups = useGroups((s) => s.groups);
  const status = useGroups((s) => s.status);
  const error = useGroups((s) => s.error);
  const refresh = useGroups((s) => s.refresh);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const empty = groups.length === 0;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.titleRow}>
        <ThemedText type="h1">Groups</ThemedText>
        {!empty ? (
          <IconButton
            variant="primary"
            accessibilityLabel="Create a group"
            onPress={() => router.push('/create-group')}
            icon={(color) => (
              <SymbolView
                name={{ ios: 'plus', android: 'add' }}
                size={18}
                tintColor={color}
                fallback={<View />}
              />
            )}
          />
        ) : null}
      </View>

      {empty && status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : empty ? (
        <EmptyState
          onCreate={() => router.push('/create-group')}
          onJoin={() => router.push('/join-group')}
          error={status === 'error' ? error : null}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          {status === 'error' && error ? (
            <ThemedText type="sm" themeColor="dangerText">
              {error}
            </ThemedText>
          ) : null}

          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              onPress={() => router.push({ pathname: '/group/[id]', params: { id: group.id } })}
            />
          ))}

          <InviteCard onPress={() => router.push('/join-group')} />
        </ScrollView>
      )}
    </ThemedView>
  );
}

function EmptyState({
  onCreate,
  onJoin,
  error,
}: {
  onCreate: () => void;
  onJoin: () => void;
  error: string | null;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSunken }]}>
        <SymbolView
          name={{ ios: 'person.2.fill', android: 'group' }}
          size={32}
          tintColor={colors.textTertiary}
          fallback={<View />}
        />
      </View>

      <ThemedText type="h2" style={styles.centerText}>
        Train together, privately
      </ThemedText>
      <ThemedText type="body" themeColor="textSecondary" style={styles.centerText}>
        Groups compare consistency, not calories. You choose what each group sees — and you
        can change it any time.
      </ThemedText>

      {error ? (
        <ThemedText type="sm" themeColor="dangerText" style={styles.centerText}>
          {error}
        </ThemedText>
      ) : null}

      <View style={styles.emptyActions}>
        <Button label="Create a group" onPress={onCreate} fullWidth />
        <Button label="Join with an invite" variant="secondary" onPress={onJoin} fullWidth />
      </View>
    </View>
  );
}

function InviteCard({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <Card style={[styles.inviteCard, { borderColor: colors.borderStrong }]}>
        <SymbolView
          name={{ ios: 'link', android: 'link' }}
          size={20}
          tintColor={colors.textSecondary}
          fallback={<View />}
        />
        <View style={styles.inviteText}>
          <ThemedText type="smBold">Have an invite?</ThemedText>
          <ThemedText type="sm" themeColor="textSecondary">
            Open the link or paste the code to see what you&apos;d share before joining.
          </ThemedText>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.s24,
    paddingTop: Spacing.s16,
    paddingBottom: Spacing.s12,
  },
  content: {
    paddingHorizontal: Spacing.s24,
    paddingBottom: BottomTabInset + Spacing.s24,
    gap: Spacing.s16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.s16,
    paddingHorizontal: Spacing.s32,
    paddingBottom: BottomTabInset,
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.s8,
  },
  centerText: {
    textAlign: 'center',
  },
  emptyActions: {
    alignSelf: 'stretch',
    gap: Spacing.s12,
    marginTop: Spacing.s16,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s16,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
  },
  inviteText: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.85,
  },
});
