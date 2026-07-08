import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const ICON_SIZE = 40;

/**
 * Persistent top bar shared across every tab. Rendered above the tabs in the
 * root layout (native tabs don't provide a header).
 */
export function AppHeader() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <ThemedView
      style={[
        styles.header,
        { paddingTop: insets.top + Spacing.two, borderBottomColor: theme.backgroundSelected },
      ]}>
      <View style={styles.side}>
        <PlanIcon />
      </View>
      <View style={styles.center}>
        <DateSwitcher />
      </View>
      <View style={[styles.side, styles.sideRight]}>
        <ProfileButton />
      </View>
    </ThemedView>
  );
}

/**
 * App icon placeholder. Will switch icon / treatment by subscription tier
 * (free / pro / pro max).
 */
function PlanIcon() {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundSelected" style={styles.iconBox}>
      <SymbolView
        name={{ ios: 'bolt.fill', android: 'bolt' }}
        size={22}
        tintColor={theme.textSecondary}
        fallback={<View />}
      />
    </ThemedView>
  );
}

/**
 * Date placeholder. Will become a calendar / day-switching control.
 */
function DateSwitcher() {
  const theme = useTheme();
  const label = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Pressable onPress={() => {}} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.datePill}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <SymbolView
          name={{ ios: 'chevron.down', android: 'expand_more' }}
          size={14}
          tintColor={theme.textSecondary}
          fallback={<View />}
        />
      </ThemedView>
    </Pressable>
  );
}

/**
 * Profile button placeholder. Leads to profile settings — for now the Profile
 * tab. Will show the user's avatar image.
 */
function ProfileButton() {
  const theme = useTheme();
  return (
    <Link href="/profile" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profile settings"
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.avatar}>
          <SymbolView
            name={{ ios: 'person.fill', android: 'person' }}
            size={22}
            tintColor={theme.textSecondary}
            fallback={<View />}
          />
        </ThemedView>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: {
    width: ICON_SIZE,
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  iconBox: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.five,
  },
  pressed: {
    opacity: 0.7,
  },
});
