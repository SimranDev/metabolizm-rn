import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

type Props = {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** Optional leading icon, platform pair like the rest of the app. */
  icon?: SymbolViewProps['name'];
};

/** A selectable row used for goal / gender / activity / plan choices. */
export function OptionCard({ label, description, selected, onPress, icon }: Props) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={selected ? 'backgroundSelected' : 'backgroundElement'}
        style={[styles.card, { borderColor: selected ? theme.tint : 'transparent' }]}>
        {icon ? (
          <SymbolView
            name={icon}
            size={24}
            tintColor={selected ? theme.tint : theme.textSecondary}
            fallback={<View style={styles.iconSpacer} />}
          />
        ) : null}
        <View style={styles.text}>
          <ThemedText type="smallBold" style={styles.label}>
            {label}
          </ThemedText>
          {description ? (
            <ThemedText type="small" themeColor="textSecondary">
              {description}
            </ThemedText>
          ) : null}
        </View>
        {selected ? (
          <SymbolView
            name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }}
            size={22}
            tintColor={theme.tint}
            fallback={<View />}
          />
        ) : null}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
  },
  iconSpacer: { width: 24, height: 24 },
  text: { flex: 1, gap: Spacing.half },
  label: { fontSize: 16 },
  pressed: { opacity: 0.7 },
});
