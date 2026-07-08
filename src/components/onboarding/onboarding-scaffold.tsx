import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { type ReactNode, useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

type Props = {
  /** 0..1 completion of the flow, drives the progress bar. */
  progress: number;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /** Primary action. Omit to hide the default footer button (pass `footer`). */
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  /** Replace the default Next button entirely. */
  footer?: ReactNode;
  showBack?: boolean;
};

export function OnboardingScaffold({
  progress,
  title,
  subtitle,
  children,
  onNext,
  nextLabel = 'Continue',
  nextDisabled,
  footer,
  showBack = true,
}: Props) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          {showBack && router.canGoBack() ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              hitSlop={12}
              style={({ pressed }) => pressed && styles.pressed}>
              <SymbolView
                name={{ ios: 'chevron.left', android: 'arrow_back' }}
                size={22}
                tintColor={theme.textSecondary}
                fallback={<ThemedText themeColor="textSecondary">Back</ThemedText>}
              />
            </Pressable>
          ) : (
            <View style={styles.backSpacer} />
          )}
          <ProgressBar progress={progress} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <ThemedText type="subtitle" style={styles.title}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              {subtitle}
            </ThemedText>
          ) : null}
          <View style={styles.body}>{children}</View>
        </ScrollView>

        <View style={styles.footer}>
          {footer ?? (
            <PrimaryButton
              label={nextLabel}
              disabled={nextDisabled}
              onPress={() => {
                haptics.advance();
                onNext?.();
              }}
            />
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  // Held in state (not a ref) so it can be read during render without tripping
  // the react-hooks refs rule; created once via the lazy initializer.
  const [anim] = useState(() => new Animated.Value(Math.max(0, Math.min(1, progress))));

  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.max(0, Math.min(1, progress)),
      duration: reduceMotion ? 0 : 260,
      useNativeDriver: false,
    }).start();
  }, [anim, progress, reduceMotion]);

  const width = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
      <Animated.View style={[styles.fill, { width, backgroundColor: theme.tint }]} />
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.tint },
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={styles.buttonLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  backSpacer: { width: 22 },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  title: { marginTop: Spacing.two },
  subtitle: { marginTop: Spacing.two },
  body: { marginTop: Spacing.four, gap: Spacing.three },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  button: {
    height: 54,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { color: '#ffffff', fontSize: 16 },
  pressed: { opacity: 0.7 },
});
