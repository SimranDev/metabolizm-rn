import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { LiveReadout } from '@/components/onboarding/live-readout';
import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { SocialAuthButtons } from '@/components/onboarding/social-auth-buttons';
import { Input } from '@/components/ui/input';
import { ThemedText } from '@/components/themed-text';
import { signUp, type AuthUser } from '@/lib/auth';
import { haptics } from '@/lib/haptics';
import { buildMetrics, resolveSelectedPlan } from '@/lib/onboarding-metrics';
import { useOnboarding } from '@/store/onboarding';
import { useProfile } from '@/store/profile';
import type { Profile } from '@metabolizm/shared';

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

  // Shared by the email and social paths: the account exists — persist the
  // plan and flip the root gate to the app (also clears in-progress answers).
  const finishOnboarding = (user: AuthUser) => {
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
    completeOnboarding(profile);
    answers.reset();
  };

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const user = await signUp(email, password);
      finishOnboarding(user);
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

      <SocialAuthButtons
        mode="sign-up"
        busy={submitting}
        onStart={() => {
          setError(null);
          setSubmitting(true);
        }}
        onSuccess={finishOnboarding}
        onCancel={() => setSubmitting(false)}
        onError={(message) => {
          setError(message);
          setSubmitting(false);
        }}
      />

      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <Input
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
        <ThemedText type="sm" themeColor="dangerText" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  error: { textAlign: 'center' },
});
