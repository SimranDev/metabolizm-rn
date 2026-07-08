import { Slider } from '@expo/ui/community/slider';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { LiveReadout } from '@/components/onboarding/live-readout';
import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  buildCustomPlan,
  buildPlans,
  CALORIE_FLOOR,
  defaultPlanId,
  maintenanceCalories,
  type Plan,
  type PlanId,
} from '@/lib/health';
import { buildMetrics } from '@/lib/onboarding-metrics';
import { stepProgress } from '@/lib/onboarding-steps';
import { useOnboarding } from '@/store/onboarding';

const roundCals = (n: number) => Math.round(n).toLocaleString();
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function PlanScreen() {
  const router = useRouter();
  const theme = useTheme();
  const answers = useOnboarding();
  const metrics = buildMetrics(answers);

  const [selectedId, setSelectedId] = useState<PlanId>(
    answers.selectedPlanId ?? (answers.goal ? defaultPlanId(answers.goal) : 'steady'),
  );

  // Direction of change: negative = lose, positive = gain, 0 = maintain.
  const direction = metrics
    ? metrics.goalWeightKg != null
      ? Math.sign(metrics.goalWeightKg - metrics.weightKg)
      : metrics.goal === 'gain-muscle'
        ? 1
        : metrics.goal === 'lose'
          ? -1
          : 0
    : 0;

  const [customRate, setCustomRate] = useState<number>(
    answers.customWeeklyRateKg ?? direction * 0.5,
  );

  if (!metrics) {
    // Shouldn't happen — every prior step is required — but fail safe.
    return (
      <OnboardingScaffold
        progress={stepProgress('plan')}
        title="Let's finish your details"
        onNext={() => router.replace('/goal')}
        nextLabel="Go back">
        <ThemedText themeColor="textSecondary">Some details are missing.</ThemedText>
      </OnboardingScaffold>
    );
  }

  const presets = buildPlans(metrics);
  const maintenance = Math.round(maintenanceCalories(metrics));
  const showCustom = direction !== 0;

  const selectedPlan: Plan =
    selectedId === 'custom' && showCustom
      ? buildCustomPlan(metrics, customRate)
      : (presets.find((p) => p.id === selectedId) ?? presets[0]);

  const onContinue = () => {
    answers.set({
      selectedPlanId: selectedPlan.id,
      customWeeklyRateKg: selectedPlan.id === 'custom' ? customRate : undefined,
    });
    router.push('/sign-up');
  };

  return (
    <OnboardingScaffold
      progress={stepProgress('plan')}
      title="Choose your pace"
      subtitle={`Maintenance is about ${maintenance.toLocaleString()} cal/day. Pick how fast you want to go.`}
      onNext={onContinue}
      nextLabel="This looks good">
      {presets.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          selected={selectedId === plan.id}
          onPress={() => setSelectedId(plan.id)}
        />
      ))}

      {showCustom ? (
        <ThemedView
          type={selectedId === 'custom' ? 'backgroundSelected' : 'backgroundElement'}
          style={[
            styles.card,
            { borderColor: selectedId === 'custom' ? theme.tint : 'transparent' },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selectedId === 'custom' }}
            onPress={() => setSelectedId('custom')}
            style={styles.cardHeader}>
            <View style={styles.cardText}>
              <ThemedText type="smallBold" style={styles.cardLabel}>
                Custom
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Set your own weekly pace
              </ThemedText>
            </View>
            {selectedId === 'custom' ? (
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                {roundCals(selectedPlan.targetCalories)} cal
              </ThemedText>
            ) : null}
          </Pressable>

          {selectedId === 'custom' ? (
            <View style={styles.sliderWrap}>
              <Slider
                value={Math.abs(customRate)}
                minimumValue={0.1}
                maximumValue={1.0}
                step={0.05}
                minimumTrackTintColor={theme.tint}
                onValueChange={(v) => setCustomRate(direction * Math.round(v * 100) / 100)}
                style={styles.slider}
              />
              <ThemedText type="small" themeColor="textSecondary" style={styles.sliderLabel}>
                {`${direction < 0 ? 'Lose' : 'Gain'} ~${Math.abs(customRate).toFixed(2)} kg/week`}
                {selectedPlan.projectedDate
                  ? ` · reach goal ~${fmtDate(selectedPlan.projectedDate)}`
                  : ''}
              </ThemedText>
            </View>
          ) : null}
        </ThemedView>
      ) : null}

      <LiveReadout
        items={[
          { label: 'Protein', value: `${selectedPlan.macros.proteinG} g` },
          { label: 'Carbs', value: `${selectedPlan.macros.carbsG} g` },
          { label: 'Fat', value: `${selectedPlan.macros.fatG} g` },
        ]}
      />

      {selectedPlan.clamped ? (
        <ThemedText type="small" themeColor="danger">
          Adjusted up to a safe minimum of {CALORIE_FLOOR[metrics.sex].toLocaleString()} cal/day.
        </ThemedText>
      ) : null}
      {selectedPlan.exceedsSafeRate ? (
        <ThemedText type="small" themeColor="danger">
          This pace is faster than generally recommended (about 1% of bodyweight per week).
        </ThemedText>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
        Estimates only, not medical advice. Check with a healthcare professional before making big
        changes.
      </ThemedText>
    </OnboardingScaffold>
  );
}

function PlanCard({
  plan,
  selected,
  onPress,
}: {
  plan: Plan;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={selected ? 'backgroundSelected' : 'backgroundElement'}
        style={[styles.card, styles.cardHeader, { borderColor: selected ? theme.tint : 'transparent' }]}>
        <View style={styles.cardText}>
          <ThemedText type="smallBold" style={styles.cardLabel}>
            {plan.label}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {plan.description}
            {plan.projectedDate ? ` · reach goal ~${fmtDate(plan.projectedDate)}` : ''}
          </ThemedText>
        </View>
        <ThemedText type="smallBold" style={[styles.cals, selected && { color: theme.tint }]}>
          {roundCals(plan.targetCalories)}
          {'\n'}
          <ThemedText type="small" themeColor="textSecondary">
            cal/day
          </ThemedText>
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    borderWidth: 2,
    padding: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardText: { flex: 1, gap: Spacing.half },
  cardLabel: { fontSize: 16 },
  cals: { fontSize: 20, textAlign: 'right' },
  sliderWrap: { marginTop: Spacing.three, gap: Spacing.two },
  slider: { height: 40 },
  sliderLabel: { textAlign: 'center' },
  disclaimer: { textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
