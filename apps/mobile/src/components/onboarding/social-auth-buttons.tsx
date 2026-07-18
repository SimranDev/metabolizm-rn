import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { signInWithApple, signInWithGoogle, type AuthUser } from '@/lib/auth';
import { Radius, Spacing, useTheme } from '@/theme';

type Props = {
  mode: 'sign-in' | 'sign-up';
  /** Disables both buttons (shared with the email form's submitting state). */
  busy: boolean;
  onStart: () => void;
  onSuccess: (user: AuthUser) => void;
  /** User dismissed the native sheet — clear busy, show no error. */
  onCancel: () => void;
  onError: (message: string) => void;
};

/**
 * "Continue with Apple / Google" for the sign-in and sign-up screens, with
 * the "or" divider to the email form below. Apple renders the native HIG
 * button (iOS only); Google is a themed secondary button with the G mark,
 * per Google's custom-button branding guidance.
 */
export function SocialAuthButtons({ mode, busy, onStart, onSuccess, onCancel, onError }: Props) {
  const { colors, scheme } = useTheme();
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    AppleAuthentication.isAvailableAsync()
      .then((available) => mounted && setAppleAvailable(available))
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const run = async (provider: () => Promise<AuthUser | null>) => {
    if (busy) return;
    onStart();
    try {
      const user = await provider();
      if (user === null) {
        onCancel();
      } else {
        onSuccess(user);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  return (
    <View style={styles.container}>
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            mode === 'sign-up'
              ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
              : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
          }
          buttonStyle={
            scheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={Radius.md}
          style={styles.appleButton}
          onPress={() => run(signInWithApple)}
        />
      ) : null}
      <Button
        label="Continue with Google"
        variant="secondary"
        size="lg"
        fullWidth
        disabled={busy}
        icon={() => (
          <Image source={require('@/assets/images/google-g.png')} style={styles.googleMark} />
        )}
        onPress={() => run(signInWithGoogle)}
      />
      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <ThemedText type="sm" themeColor="textSecondary">
          or
        </ThemedText>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.s12,
  },
  // Matches ui/Button size="lg" + fullWidth.
  appleButton: {
    height: 52,
    alignSelf: 'stretch',
  },
  googleMark: {
    width: 18,
    height: 18,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s12,
    marginTop: Spacing.s4,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth * 2,
  },
});
