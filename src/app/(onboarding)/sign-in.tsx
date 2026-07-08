import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { TextField } from '@/components/onboarding/text-field';
import { ThemedText } from '@/components/themed-text';
import { signIn } from '@/lib/auth';
import { haptics } from '@/lib/haptics';
import { useProfile } from '@/store/profile';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      haptics.success();
      // STUB: with a real backend we'd fetch the user's saved profile here and
      // skip onboarding. Locally, restore a profile if this device has one,
      // otherwise send them through setup.
      const existing = useProfile.getState().profile;
      if (existing) {
        useProfile.getState().completeOnboarding(existing);
      } else {
        router.replace('/goal');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSubmitting(false);
    }
  };

  return (
    <OnboardingScaffold
      progress={0}
      title="Welcome back"
      subtitle="Sign in to sync your plan and history."
      nextLabel={submitting ? 'Signing in…' : 'Sign in'}
      nextDisabled={submitting || !email || !password}
      onNext={onSubmit}>
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
        placeholder="Your password"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
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
