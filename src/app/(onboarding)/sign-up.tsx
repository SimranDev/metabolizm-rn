import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { LiveReadout } from '@/components/onboarding/live-readout';
import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { TextField } from '@/components/onboarding/text-field';
import { ThemedText } from '@/components/themed-text';
import { signUp } from '@/lib/auth';
import { haptics } from '@/lib/haptics';
import { buildMetrics, resolveSelectedPlan } from '@/lib/onboarding-metrics';
import { useOnboarding } from '@/store/onboarding';
import { type Profile, useProfile } from '@/store/profile';

export default function SignUpScreen() {
  const router = useRouter();
  const answers = useOnboarding();
  const completeOnboarding = useProfile((s) => s.completeOnboarding);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const metrics = buildMetrics(answers);
  if (!metrics) {
    return (
      <OnboardingScaffold
        progress={1}
        title="Almost there"
        nextLabel="Back to start"
        onNext={() => router.replace('/goal')}>
        <ThemedText themeColor="textSecondary">Some details are missing.</ThemedText>
      </OnboardingScaffold>
    );
  }

  const plan = resolveSelectedPlan(answers, metrics);

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const user = await signUp(email, password);
      const profile: Profile = {
        goal: metrics.goal,
        sex: metrics.sex,
        dob: answers.dob!,
        heightCm: metrics.heightCm,
        weightKg: metrics.weightKg,
        goalWeightKg: metrics.goalWeightKg,
        activityLevel: metrics.activityLevel,
        weightUnit: answers.weightUnit,
        heightUnit: answers.heightUnit,
        email: user.email,
        planId: plan.id,
        targetCalories: plan.targetCalories,
        macros: plan.macros,
      };
      haptics.success();
      // Flips the root gate to the app; also clears the in-progress answers.
      completeOnboarding(profile);
      answers.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSubmitting(false);
    }
  };

  return (
    <OnboardingScaffold
      progress={1}
      title="Save your plan"
      subtitle="Create an account to keep your plan and sync across devices."
      nextLabel={submitting ? 'Creating…' : 'Create account'}
      nextDisabled={submitting || !email || !password}
      onNext={onSubmit}>
      <LiveReadout
        items={[
          { label: 'Daily target', value: `${plan.targetCalories.toLocaleString()} cal` },
          { label: 'Plan', value: plan.label },
        ]}
      />

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password-new"
        textContentType="newPassword"
      />

      {error ? (
        <ThemedText type="small" themeColor="danger" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  error: { textAlign: 'center' },
});
