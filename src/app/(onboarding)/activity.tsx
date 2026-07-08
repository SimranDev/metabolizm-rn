import { useRouter } from 'expo-router';

import { LiveReadout } from '@/components/onboarding/live-readout';
import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { OptionCard } from '@/components/onboarding/option-card';
import { type ActivityLevel, maintenanceCalories } from '@/lib/health';
import { buildMetrics } from '@/lib/onboarding-metrics';
import { stepProgress } from '@/lib/onboarding-steps';
import { useOnboarding } from '@/store/onboarding';

const LEVELS: { value: ActivityLevel; label: string; description: string }[] = [
  { value: 'sedentary', label: 'Sedentary', description: 'Little or no exercise' },
  { value: 'light', label: 'Lightly active', description: 'Light exercise 1–3 days/week' },
  { value: 'moderate', label: 'Moderately active', description: 'Exercise 3–5 days/week' },
  { value: 'very', label: 'Very active', description: 'Hard exercise 6–7 days/week' },
  { value: 'athlete', label: 'Athlete', description: 'Daily training or a physical job' },
];

export default function ActivityScreen() {
  const router = useRouter();
  const answers = useOnboarding();
  const { activityLevel, set } = answers;

  // Live maintenance calories once a level is chosen (all other inputs are in).
  const metrics = buildMetrics(answers);
  const tdeeValue = metrics ? Math.round(maintenanceCalories(metrics)) : null;

  return (
    <OnboardingScaffold
      progress={stepProgress('activity')}
      title="How active are you?"
      subtitle="Used to estimate the calories you burn each day."
      nextDisabled={!activityLevel}
      onNext={() => router.push('/plan')}>
      {LEVELS.map((l) => (
        <OptionCard
          key={l.value}
          label={l.label}
          description={l.description}
          selected={activityLevel === l.value}
          onPress={() => set({ activityLevel: l.value })}
        />
      ))}

      {tdeeValue != null ? (
        <LiveReadout
          items={[{ label: 'Maintenance', value: `${tdeeValue.toLocaleString()} cal/day` }]}
        />
      ) : null}
    </OnboardingScaffold>
  );
}
