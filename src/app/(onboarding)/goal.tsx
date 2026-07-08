import { useRouter } from 'expo-router';
import { type SymbolViewProps } from 'expo-symbols';

import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { OptionCard } from '@/components/onboarding/option-card';
import type { Goal } from '@/lib/health';
import { stepProgress } from '@/lib/onboarding-steps';
import { useOnboarding } from '@/store/onboarding';

const GOALS: {
  value: Goal;
  label: string;
  description: string;
  icon: SymbolViewProps['name'];
}[] = [
  {
    value: 'lose',
    label: 'Lose weight',
    description: 'Shed fat at a sustainable pace',
    icon: { ios: 'arrow.down.circle.fill', android: 'trending_down' },
  },
  {
    value: 'gain-muscle',
    label: 'Gain muscle',
    description: 'Build size with a lean surplus',
    icon: { ios: 'figure.strengthtraining.traditional', android: 'fitness_center' },
  },
  {
    value: 'recomp',
    label: 'Body recomposition',
    description: 'Lose fat and gain muscle at once',
    icon: { ios: 'arrow.triangle.2.circlepath', android: 'sync' },
  },
  {
    value: 'maintain',
    label: 'Maintain weight',
    description: 'Hold steady and eat mindfully',
    icon: { ios: 'equal.circle.fill', android: 'drag_handle' },
  },
  {
    value: 'improve-health',
    label: 'Eat healthier',
    description: 'Better habits, no strict target',
    icon: { ios: 'heart.circle.fill', android: 'favorite' },
  },
];

export default function GoalScreen() {
  const router = useRouter();
  const goal = useOnboarding((s) => s.goal);
  const set = useOnboarding((s) => s.set);

  return (
    <OnboardingScaffold
      progress={stepProgress('goal')}
      title="What's your goal?"
      subtitle="We'll tailor your calorie and macro targets to this."
      nextDisabled={!goal}
      onNext={() => router.push('/gender')}>
      {GOALS.map((g) => (
        <OptionCard
          key={g.value}
          label={g.label}
          description={g.description}
          icon={g.icon}
          selected={goal === g.value}
          onPress={() => set({ goal: g.value })}
        />
      ))}
    </OnboardingScaffold>
  );
}
