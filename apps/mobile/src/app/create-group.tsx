import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/screen-header';
import { OptionCard } from '@/components/onboarding/option-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CATEGORY_BLURB, CATEGORY_LABEL, GROUP_CATEGORIES } from '@/lib/groups';
import { haptics } from '@/lib/haptics';
import { useGroups } from '@/store/groups';
import { Spacing } from '@/theme';
import type { GroupCategory } from '@metabolizm/shared';

/**
 * Create a group. The category is a privacy decision, not a label: it sets the
 * share defaults every member starts from, so it's picked before the group
 * exists rather than edited later.
 */
export default function CreateGroupScreen() {
  const router = useRouter();
  const createGroup = useGroups((s) => s.createGroup);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<GroupCategory>('friends');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (name.trim().length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const group = await createGroup({ name: name.trim(), category });
      haptics.success();
      // Replace, so backing out of the new group returns to the tab.
      router.replace({ pathname: '/group/[id]', params: { id: group.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the group.');
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="New group" dismissLabel="Cancel" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Input
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Saturday crew"
            autoCapitalize="words"
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />

          <View style={styles.section}>
            <ThemedText type="micro" themeColor="textTertiary">
              Category — sets what members share by default
            </ThemedText>
            {GROUP_CATEGORIES.map((option) => (
              <OptionCard
                key={option}
                label={
                  option === 'trainer' ? 'Trainer clients' : CATEGORY_LABEL[option]
                }
                description={CATEGORY_BLURB[option]}
                selected={category === option}
                onPress={() => setCategory(option)}
              />
            ))}
          </View>

          <ThemedText type="sm" themeColor="textTertiary">
            Everyone who joins sees these defaults on a consent screen and can turn any of
            them off before they join — and change them later.
          </ThemedText>

          {error ? (
            <ThemedText type="sm" themeColor="dangerText">
              {error}
            </ThemedText>
          ) : null}

          <Button
            label={saving ? 'Creating…' : 'Create group'}
            onPress={() => void submit()}
            disabled={name.trim().length === 0 || saving}
            fullWidth
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: Spacing.s20,
    paddingBottom: Spacing.s48,
    gap: Spacing.s20,
  },
  section: {
    gap: Spacing.s8,
  },
});
