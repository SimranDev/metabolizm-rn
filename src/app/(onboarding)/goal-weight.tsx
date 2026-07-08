import { useRouter } from 'expo-router';

import { LiveReadout } from '@/components/onboarding/live-readout';
import { WeightField } from '@/components/onboarding/measure-fields';
import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { ThemedText } from '@/components/themed-text';
import { bmi, fromKg } from '@/lib/health';
import { stepProgress } from '@/lib/onboarding-steps';
import { useOnboarding } from '@/store/onboarding';

export default function GoalWeightScreen() {
  const router = useRouter();
  const heightCm = useOnboarding((s) => s.heightCm);
  const weightKg = useOnboarding((s) => s.weightKg);
  const goalWeightKg = useOnboarding((s) => s.goalWeightKg);
  const weightUnit = useOnboarding((s) => s.weightUnit);
  const set = useOnboarding((s) => s.set);

  const valid = goalWeightKg != null && goalWeightKg >= 25 && goalWeightKg <= 400;
  const goalBmi = valid && heightCm != null ? bmi(goalWeightKg, heightCm) : null;
  const underweightGoal = goalBmi != null && goalBmi < 18.5;

  const delta =
    valid && weightKg != null ? fromKg(Math.abs(goalWeightKg - weightKg), weightUnit) : null;

  return (
    <OnboardingScaffold
      progress={stepProgress('goal-weight')}
      title="What's your goal weight?"
      nextDisabled={!valid}
      onNext={() => router.push('/activity')}>
      <WeightField
        key={weightUnit}
        unit={weightUnit}
        onUnitChange={(u) => set({ weightUnit: u })}
        valueKg={goalWeightKg}
        onChange={(kg) => set({ goalWeightKg: kg })}
      />

      {goalBmi != null ? (
        <LiveReadout
          items={[
            { label: 'Goal BMI', value: goalBmi.toFixed(1), tone: underweightGoal ? 'warn' : 'default' },
            ...(delta != null
              ? [{ label: 'To change', value: `${delta.toFixed(1)} ${weightUnit}` }]
              : []),
          ]}
        />
      ) : null}

      {underweightGoal ? (
        <ThemedText type="small" themeColor="danger">
          This goal falls in the underweight range (BMI under 18.5). Consider a higher target — you
          can always adjust later.
        </ThemedText>
      ) : null}
    </OnboardingScaffold>
  );
}
