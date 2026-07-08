import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LiveReadout } from '@/components/onboarding/live-readout';
import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { ageFromDob } from '@/lib/health';
import { stepProgress } from '@/lib/onboarding-steps';
import { useOnboarding } from '@/store/onboarding';

const MIN_AGE = 13;
const yearsAgo = (n: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d;
};

export default function DobScreen() {
  const router = useRouter();
  const theme = useTheme();
  const storedDob = useOnboarding((s) => s.dob);
  const set = useOnboarding((s) => s.set);

  const [date, setDate] = useState<Date>(storedDob ? new Date(storedDob) : yearsAgo(25));

  const age = useMemo(() => ageFromDob(date), [date]);
  const tooYoung = age < MIN_AGE;

  const onContinue = () => {
    set({ dob: date.toISOString() });
    router.push('/height');
  };

  return (
    <OnboardingScaffold
      progress={stepProgress('dob')}
      title="When were you born?"
      subtitle="Age is part of the metabolic formula — we don't show it publicly."
      nextDisabled={tooYoung}
      onNext={onContinue}>
      <View style={styles.picker}>
        <DateTimePicker
          value={date}
          mode="date"
          // Inline on both platforms. Without this, Android defaults to a modal
          // dialog that re-opens while mounted and traps the screen.
          presentation="inline"
          display="spinner"
          accentColor={theme.tint}
          maximumDate={new Date()}
          minimumDate={yearsAgo(120)}
          onValueChange={(_event, next) => setDate(next)}
        />
      </View>

      <LiveReadout items={[{ label: 'Your age', value: `${Math.max(age, 0)} yrs` }]} />

      {tooYoung ? (
        <ThemedText type="small" themeColor="danger" style={styles.warn}>
          You must be at least {MIN_AGE} to use Metabolizm.
        </ThemedText>
      ) : null}
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  picker: { alignItems: 'center' },
  warn: { textAlign: 'center' },
});
