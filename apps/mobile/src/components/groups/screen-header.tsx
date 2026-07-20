import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, useTheme } from '@/theme';

type Props = {
  title: string;
  subtitle?: string;
  /** Trailing action, e.g. an invite or settings button. */
  action?: ReactNode;
  /** Close affordance instead of a back chevron, for modal routes. */
  dismissLabel?: string;
};

/**
 * Header for group routes. These push at the ROOT stack (outside the tab
 * group), so the persistent AppHeader isn't present and each screen carries
 * its own title and back affordance.
 */
export function GroupScreenHeader({ title, subtitle, action, dismissLabel }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <ThemedView
      style={[
        styles.header,
        { paddingTop: insets.top + Spacing.s8, borderBottomColor: colors.border },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dismissLabel ?? 'Go back'}
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => pressed && styles.pressed}>
        <SymbolView
          name={
            dismissLabel
              ? { ios: 'xmark', android: 'close' }
              : { ios: 'chevron.left', android: 'arrow_back' }
          }
          size={20}
          tintColor={colors.textSecondary}
          fallback={<View style={styles.iconSpacer} />}
        />
      </Pressable>

      <View style={styles.titles}>
        <ThemedText type="h3" themeColor="inkStrong" numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="sm" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.action}>{action}</View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s12,
    paddingHorizontal: Spacing.s20,
    paddingBottom: Spacing.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  action: {
    minWidth: 24,
    alignItems: 'flex-end',
  },
  iconSpacer: {
    width: 20,
    height: 20,
  },
  pressed: {
    opacity: 0.6,
  },
});
