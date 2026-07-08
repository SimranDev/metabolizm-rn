import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/onboarding-scaffold';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          <View style={[styles.mark, { backgroundColor: theme.tint }]}>
            <SymbolView
              name={{ ios: 'bolt.fill', android: 'bolt' }}
              size={44}
              tintColor="#ffffff"
              fallback={<View />}
            />
          </View>
          <ThemedText type="subtitle" style={styles.brand}>
            Metabolizm
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.tagline}>
            Your swiss-knife for weight, calories, and macros. Let&apos;s build your personal plan
            in about 2 minutes.
          </ThemedText>
        </View>

        <View style={styles.actions}>
          <PrimaryButton label="Get started" onPress={() => router.push('/goal')} />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/sign-in')}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.signin}>
              Already have an account?{' '}
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                Sign in
              </ThemedText>
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: Spacing.four },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  mark: {
    width: 88,
    height: 88,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { marginTop: Spacing.two },
  tagline: { textAlign: 'center', paddingHorizontal: Spacing.three },
  actions: { gap: Spacing.three, paddingBottom: Spacing.four },
  signin: { textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
