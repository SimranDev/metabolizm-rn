import { useRouter } from 'expo-router';

import { LiveReadout } from '@/components/onboarding/live-readout';
import { WeightField } from '@/components/onboarding/measure-fields';
import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { bmi, bmiCategory } from '@/lib/health';
import { stepProgress } from '@/lib/onboarding-steps';
import { useOnboarding } from '@/store/onboarding';

const CATEGORY_LABEL: Record<string, string> = {
  underweight: 'Underweight',
  normal: 'Healthy',
  overweight: 'Overweight',
  obese: 'Obese',
};

export default function WeightScreen() {
  const router = useRouter();
  const goal = useOnboarding((s) => s.goal);
  const heightCm = useOnboarding((s) => s.heightCm);
  const weightKg = useOnboarding((s) => s.weightKg);
  const weightUnit = useOnboarding((s) => s.weightUnit);
  const set = useOnboarding((s) => s.set);

  const valid = weightKg != null && weightKg >= 25 && weightKg <= 400;

  // Live BMI feedback (we already have their height).
  const showBmi = valid && heightCm != null;
  const bmiValue = showBmi ? bmi(weightKg, heightCm) : null;
  const category = bmiValue != null ? bmiCategory(bmiValue) : null;

  return (
    <OnboardingScaffold
      progress={stepProgress('weight')}
      title="What's your current weight?"
      nextDisabled={!valid}
      onNext={() => router.push(goal === 'maintain' ? '/activity' : '/goal-weight')}>
      <WeightField
        key={weightUnit}
        unit={weightUnit}
        onUnitChange={(u) => set({ weightUnit: u })}
        valueKg={weightKg}
        onChange={(kg) => set({ weightKg: kg })}
      />

      {bmiValue != null && category != null ? (
        <LiveReadout
          items={[
            { label: 'BMI', value: bmiValue.toFixed(1) },
            {
              label: 'Category',
              value: CATEGORY_LABEL[category],
              tone: category === 'normal' ? 'default' : 'warn',
            },
          ]}
        />
      ) : null}
    </OnboardingScaffold>
  );
}
