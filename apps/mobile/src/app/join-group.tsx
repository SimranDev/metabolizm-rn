import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/screen-header';
import { ShareToggles } from '@/components/groups/share-toggles';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRequest } from '@/hooks/use-request';
import { groupsApi } from '@/lib/api';
import { CATEGORY_LABEL, parseInviteToken, shareConfigDiff } from '@/lib/groups';
import { haptics } from '@/lib/haptics';
import { useGroups } from '@/store/groups';
import { Spacing } from '@/theme';
import type { GroupShareConfig } from '@metabolizm/shared';

/**
 * Join by invite — the consent screen.
 *
 * Nothing is joined until the toggles have been seen: the server's preview
 * says what the category would share, the user can turn any of it off, and
 * only the toggles they actually changed are sent (the server merges a patch,
 * so a full object would clobber defaults they never touched).
 */
export default function JoinGroupScreen() {
  const { token: tokenParam } = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(tokenParam ?? '');

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="Join a group" dismissLabel="Cancel" />
      {token ? (
        <ConsentView token={token} onReset={() => setToken('')} />
      ) : (
        <TokenEntry onSubmit={setToken} />
      )}
    </ThemedView>
  );
}

function TokenEntry({ onSubmit }: { onSubmit: (token: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const parsed = parseInviteToken(value);
    if (!parsed) {
      setError("That doesn't look like an invite link or code.");
      return;
    }
    setError(null);
    onSubmit(parsed);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ThemedText type="body" themeColor="textSecondary">
        Paste the invite link or code you were sent. You&apos;ll see exactly what the group
        would see before you join.
      </ThemedText>

      <Input
        label="Invite link or code"
        value={value}
        onChangeText={setValue}
        placeholder="mtbz.app/g/8KF2-QN"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={submit}
      />

      {error ? (
        <ThemedText type="sm" themeColor="dangerText">
          {error}
        </ThemedText>
      ) : null}

      <Button label="Continue" onPress={submit} disabled={value.trim().length === 0} fullWidth size="lg" />
    </ScrollView>
  );
}

function ConsentView({ token, onReset }: { token: string; onReset: () => void }) {
  const router = useRouter();
  const acceptInvite = useGroups((s) => s.acceptInvite);

  const load = useCallback(
    (signal: AbortSignal) => groupsApi.previewInvite(token, { signal }),
    [token],
  );
  const { data, loading, error } = useRequest(load);

  // Derived rather than seeded in an effect: the toggles show the server's
  // defaults until the user changes something, and only then their override.
  const [override, setOverride] = useState<GroupShareConfig | null>(null);
  const config = override ?? data?.shareDefaults ?? null;

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const join = async () => {
    if (!data || !config || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      const group = await acceptInvite(token, shareConfigDiff(data.shareDefaults, config));
      haptics.success();
      router.replace({ pathname: '/group/[id]', params: { id: group.id } });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join this group.');
      setJoining(false);
    }
  };

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !data || !config) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="body" themeColor="dangerText">
          {error ?? 'This invite is no longer valid.'}
        </ThemedText>
        <Button label="Try another code" variant="secondary" onPress={onReset} fullWidth />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.head}>
        <ThemedText type="h2">{`You've been invited to ${data.group.name}`}</ThemedText>
        <View style={styles.badges}>
          <Badge size="sm" variant="outline" label={CATEGORY_LABEL[data.group.category]} />
          <Badge
            size="sm"
            variant="neutral"
            label={`${data.group.memberCount} ${data.group.memberCount === 1 ? 'member' : 'members'}`}
          />
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText type="micro" themeColor="textTertiary">
          This group will see
        </ThemedText>
        <ShareToggles value={config} onChange={setOverride} />
      </View>

      <ThemedText type="sm" themeColor="textTertiary">
        Anything switched off shows as &quot;not shared&quot; — never a gap. You can change
        any of this later, per group, and it applies to past days too.
      </ThemedText>

      {joinError ? (
        <ThemedText type="sm" themeColor="dangerText">
          {joinError}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={joining ? 'Joining…' : 'Join group'}
          onPress={() => void join()}
          disabled={joining}
          fullWidth
          size="lg"
        />
        <Button label="Not now" variant="ghost" onPress={() => router.back()} fullWidth />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.s20,
    paddingBottom: Spacing.s48,
    gap: Spacing.s20,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  head: {
    gap: Spacing.s8,
  },
  badges: {
    flexDirection: 'row',
    gap: Spacing.s8,
  },
  section: {
    gap: Spacing.s12,
  },
  actions: {
    gap: Spacing.s8,
  },
});
