import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { GroupScreenHeader } from '@/components/groups/screen-header';
import { ShareToggles } from '@/components/groups/share-toggles';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { useRequest } from '@/hooks/use-request';
import { groupsApi } from '@/lib/api';
import { useCurrentUserId } from '@/lib/auth';
import { CATEGORY_LABEL } from '@/lib/groups';
import { useGroups, useGroupSummary } from '@/store/groups';
import { Spacing } from '@/theme';
import type { GroupShareConfig } from '@metabolizm/shared';

/**
 * Per-group sharing settings, plus leaving the group.
 *
 * The current config is read back from my own feed card rather than kept
 * client-side, so the toggles always reflect what the server would actually
 * expose right now. Saving sends only the keys that changed.
 */
export default function GroupSharingScreen() {
  const { groupId = '' } = useLocalSearchParams<{ groupId?: string }>();
  const router = useRouter();
  const myUserId = useCurrentUserId();
  const summary = useGroupSummary(groupId);
  const updateSharing = useGroups((s) => s.updateSharing);
  const leave = useGroups((s) => s.leave);

  const load = useCallback(
    (signal: AbortSignal) => groupsApi.getFeed(groupId, undefined, { signal }),
    [groupId],
  );
  const { data, loading, error } = useRequest(load);

  // `saved` is what the server currently exposes (read back from my own feed
  // card); `config` is that, plus any edits made on this screen. Both derived,
  // so a refetch can never leave the toggles showing a stale config.
  const saved =
    data?.cards.find((card) => card.userId === myUserId)?.shared ?? null;
  const [override, setOverride] = useState<GroupShareConfig | null>(null);
  const config = override ?? saved;

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async () => {
    if (!config || !saved || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateSharing(groupId, saved, config);
      router.back();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your settings.');
      setSaving(false);
    }
  };

  const confirmLeave = () => {
    Alert.alert(
      `Leave ${summary?.name ?? 'this group'}?`,
      'Your past days disappear from the group immediately. Your own diary is untouched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            void leave(groupId)
              .then(() => router.dismissAll())
              .catch((err: unknown) => {
                setSaveError(
                  err instanceof Error ? err.message : 'Could not leave the group.',
                );
              });
          },
        },
      ],
    );
  };

  return (
    <ThemedView style={styles.container}>
      <GroupScreenHeader
        title="Sharing"
        subtitle={
          summary ? `${summary.name} · ${CATEGORY_LABEL[summary.category]} preset` : undefined
        }
        dismissLabel="Close"
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && !config ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : error || !config ? (
          <ThemedText type="body" themeColor="dangerText">
            {error ?? 'Could not load your sharing settings.'}
          </ThemedText>
        ) : (
          <>
            <ThemedText type="sm" themeColor="textSecondary">
              Applies to this group only. Turning something off hides it immediately — past
              days included. Members see a &quot;not shared&quot; chip, never a blank.
            </ThemedText>

            <ShareToggles value={config} onChange={setOverride} />

            {saveError ? (
              <ThemedText type="sm" themeColor="dangerText">
                {saveError}
              </ThemedText>
            ) : null}

            <Button
              label={saving ? 'Saving…' : 'Done'}
              onPress={() => void save()}
              disabled={saving}
              fullWidth
              size="lg"
            />

            <View style={styles.danger}>
              <Button label="Leave group" variant="ghost" onPress={confirmLeave} fullWidth />
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
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
  danger: {
    marginTop: Spacing.s16,
  },
});
