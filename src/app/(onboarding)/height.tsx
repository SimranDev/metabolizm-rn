import { useRouter } from 'expo-router';

import { HeightField } from '@/components/onboarding/measure-fields';
import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { stepProgress } from '@/lib/onboarding-steps';
import { useOnboarding } from '@/store/onboarding';

export default function HeightScreen() {
  const router = useRouter();
  const heightCm = useOnboarding((s) => s.heightCm);
  const heightUnit = useOnboarding((s) => s.heightUnit);
  const set = useOnboarding((s) => s.set);

  const valid = heightCm != null && heightCm >= 80 && heightCm <= 250;

  return (
    <OnboardingScaffold
      progress={stepProgress('height')}
      title="How tall are you?"
      nextDisabled={!valid}
      onNext={() => router.push('/weight')}>
      <HeightField
        key={heightUnit}
        unit={heightUnit}
        onUnitChange={(u) => set({ heightUnit: u })}
        valueCm={heightCm}
        onChange={(cm) => set({ heightCm: cm })}
      />
    </OnboardingScaffold>
  );
}
