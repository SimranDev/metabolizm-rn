import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { SocialAuthButtons } from '@/components/onboarding/social-auth-buttons';
import { Input } from '@/components/ui/input';
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

  const onSignedIn = () => {
    haptics.success();
    // TODO(server-profile): fetch the user's saved profile from the backend
    // and skip onboarding once the endpoint exists. Locally, restore a
    // profile if this device has one, otherwise send them through setup.
    const existing = useProfile.getState().profile;
    if (existing) {
      useProfile.getState().completeOnboarding(existing);
    } else {
      router.replace('/goal');
    }
  };

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      onSignedIn();
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
      <SocialAuthButtons
        mode="sign-in"
        busy={submitting}
        onStart={() => {
          setError(null);
          setSubmitting(true);
        }}
        onSuccess={onSignedIn}
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
        placeholder="Your password"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
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
