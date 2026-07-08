import { useRouter } from 'expo-router';

import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { OptionCard } from '@/components/onboarding/option-card';
import type { Sex } from '@/lib/health';
import { stepProgress } from '@/lib/onboarding-steps';
import { useOnboarding } from '@/store/onboarding';

const OPTIONS: { value: Sex; label: string; description: string }[] = [
  { value: 'male', label: 'Male', description: '' },
  { value: 'female', label: 'Female', description: '' },
  { value: 'other', label: 'Other', description: "We'll use an average metabolic estimate" },
];

export default function GenderScreen() {
  const router = useRouter();
  const sex = useOnboarding((s) => s.sex);
  const set = useOnboarding((s) => s.set);

  return (
    <OnboardingScaffold
      progress={stepProgress('gender')}
      title="What's your sex?"
      subtitle="This sets your baseline metabolic rate. It only affects the calorie math — you can change it anytime."
      nextDisabled={!sex}
      onNext={() => router.push('/dob')}>
      {OPTIONS.map((o) => (
        <OptionCard
          key={o.value}
          label={o.label}
          description={o.description || undefined}
          selected={sex === o.value}
          onPress={() => set({ sex: o.value })}
        />
      ))}
    </OnboardingScaffold>
  );
}
