import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { WeightField } from '@/components/onboarding/measure-fields';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { haptics } from '@/lib/haptics';
import { formatWeight } from '@/lib/weight';
import { useProfile } from '@/store/profile';
import { useWeight } from '@/store/weight';
import { Spacing } from '@/theme';
import type { Profile, WeightUnit } from '@metabolizm/shared';

/** Matches the server's bound and onboarding's own goal-weight validation. */
const MIN_KG = 25;
const MAX_KG = 400;

/**
 * The goal weight.
 *
 * This is what onboarding collected and then dropped on the floor: nothing ever
 * called `setGoal`, so `user_weight_goals` stayed empty and the weight screen's
 * GOAL / TO GO chips and whole "Journey to goal" block never rendered for
 * anyone. Saving here writes the server goal that those read.
 *
 * The unit toggle inside `WeightField` is the app-wide preference (it calls
 * `setUnit`), which is why this card carries no separate unit control.
 */
export function GoalWeightCard({ profile, unit }: { profile: Profile; unit: WeightUnit }) {
  const goal = useWeight((s) => s.goal);
  const setGoal = useWeight((s) => s.setGoal);
  const setUnit = useWeight((s) => s.setUnit);
  const hasWeighIns = useWeight((s) => s.entries.length > 0);
  const updateProfile = useProfile((s) => s.updateProfile);

  // Server goal is authoritative; the onboarding snapshot is the fallback for
  // accounts created before this screen existed.
  const currentKg = goal?.targetWeightKg ?? profile.goalWeightKg ?? null;
  const [draftKg, setDraftKg] = useState<number | undefined>(currentKg ?? undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = draftKg != null && draftKg >= MIN_KG && draftKg <= MAX_KG;
  const dirty = draftKg !== (currentKg ?? undefined);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await setGoal({
        targetWeightKg: draftKg,
        // The server snapshots the starting weight from the latest weigh-in and
        // rejects the goal when there is none. Onboarding already asked for a
        // current weight, so use it rather than making someone log a weigh-in
        // before they are allowed to set a goal.
        ...(hasWeighIns ? null : { startingWeightKg: profile.weightKg }),
      });
      updateProfile({ goalWeightKg: draftKg });
      haptics.success();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your goal weight.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.card}>
      <ThemedText type="micro" themeColor="textSecondary">
        GOAL WEIGHT
      </ThemedText>
      <ThemedText type="sm" themeColor="textSecondary">
        {currentKg != null
          ? `Currently ${formatWeight(currentKg, unit)}. Drives the progress and projection on the weight screen.`
          : 'Set one to unlock the progress and projection on the weight screen.'}
      </ThemedText>

      {/* Remount on unit change so the field re-seeds from the converted value
          — it holds its own text state and will not re-derive otherwise. */}
      <WeightField
        key={unit}
        unit={unit}
        onUnitChange={setUnit}
        valueKg={draftKg}
        onChange={setDraftKg}
      />

      {draftKg != null && !valid ? (
        <ThemedText type="sm" themeColor="dangerText">
          Enter a goal between {formatWeight(MIN_KG, unit)} and {formatWeight(MAX_KG, unit)}.
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText type="sm" themeColor="dangerText">
          {error}
        </ThemedText>
      ) : null}

      {/* Shown only once edited — see the note in targets-card. */}
      {dirty ? (
        <Button
          label={saving ? 'Saving…' : 'Save goal weight'}
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
});
