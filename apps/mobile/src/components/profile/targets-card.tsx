import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usersApi } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { todayKey } from '@/store/diary';
import { useProfile } from '@/store/profile';
import { Spacing } from '@/theme';
import type { Macros, Profile } from '@metabolizm/shared';

type Draft = { calories: string; protein: string; carbs: string; fat: string };

const toDraft = (profile: Profile): Draft => ({
  calories: String(profile.targetCalories),
  protein: String(profile.macros.proteinG),
  carbs: String(profile.macros.carbsG),
  fat: String(profile.macros.fatG),
});

/** Bounds mirror putMyTargetsSchema so a bad value is caught before the round trip. */
const parse = (value: string, max: number): number | null => {
  const n = Number(value.trim());
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

/**
 * The daily calorie and macro targets.
 *
 * Saving writes BOTH sides: `PUT /v1/users/me/targets` so `daily_summaries`
 * can snapshot the new numbers and keep the day scoreable, and the local
 * profile so the Log tab's ring updates without waiting for a re-sync.
 */
export function TargetsCard({ profile }: { profile: Profile }) {
  const updateProfile = useProfile((s) => s.updateProfile);
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const calories = parse(draft.calories, 99_999);
  const protein = parse(draft.protein, 9_999);
  const carbs = parse(draft.carbs, 9_999);
  const fat = parse(draft.fat, 9_999);
  const valid = calories !== null && protein !== null && carbs !== null && fat !== null;

  const dirty =
    draft.calories !== String(profile.targetCalories) ||
    draft.protein !== String(profile.macros.proteinG) ||
    draft.carbs !== String(profile.macros.carbsG) ||
    draft.fat !== String(profile.macros.fatG);

  const edit = (key: keyof Draft) => (value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
    setError(null);
  };

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    const macros: Macros = { proteinG: protein, carbsG: carbs, fatG: fat };
    try {
      await usersApi.putMyTargets({
        // Today, not the account's start: days already scored keep the target
        // that was in force when they were scored, so past adherence is never
        // rewritten by a change made now.
        effectiveFrom: todayKey(),
        energyKcal: calories,
        proteinG: protein,
        carbsG: carbs,
        fatG: fat,
      });
      updateProfile({ targetCalories: calories, macros });
      haptics.success();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your targets.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.card}>
      <ThemedText type="micro" themeColor="textSecondary">
        DAILY TARGETS
      </ThemedText>
      <ThemedText type="sm" themeColor="textSecondary">
        Applies from today. Days you have already logged keep the targets they
        were scored against.
      </ThemedText>

      <Input
        label="Calories"
        value={draft.calories}
        onChangeText={edit('calories')}
        keyboardType="number-pad"
        maxLength={5}
      />
      <View style={styles.row}>
        <View style={styles.cell}>
          <Input
            label="Protein (g)"
            value={draft.protein}
            onChangeText={edit('protein')}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
        <View style={styles.cell}>
          <Input
            label="Carbs (g)"
            value={draft.carbs}
            onChangeText={edit('carbs')}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
        <View style={styles.cell}>
          <Input
            label="Fat (g)"
            value={draft.fat}
            onChangeText={edit('fat')}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
      </View>

      {!valid ? (
        <ThemedText type="sm" themeColor="dangerText">
          Enter a number for every field.
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText type="sm" themeColor="dangerText">
          {error}
        </ThemedText>
      ) : null}
      {saved && !dirty ? (
        <ThemedText type="sm" themeColor="primary">
          Targets updated.
        </ThemedText>
      ) : null}

      {/* Only once there is something to save. A permanently disabled primary
          button is the resting state of this screen otherwise, which reads as
          broken rather than as "nothing to do". */}
      {dirty ? (
        <Button
          label={saving ? 'Saving…' : 'Save targets'}
          onPress={() => void save()}
          disabled={saving || !valid}
          fullWidth
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.s12 },
  row: { flexDirection: 'row', gap: Spacing.s8 },
  cell: { flex: 1 },
});
