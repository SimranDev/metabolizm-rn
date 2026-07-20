import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { haptics } from '@/lib/haptics';
import { Radius, Spacing, useTheme } from '@/theme';

type Props<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** Segmented control for the in-group tabs (Today / Leaderboard / Members). */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors } = useTheme();

  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceSunken }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              haptics.select();
              onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              selected && { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && !selected && styles.pressed,
            ]}>
            <ThemedText
              type="smBold"
              themeColor={selected ? 'inkStrong' : 'textSecondary'}
              numberOfLines={1}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: Spacing.s4,
    borderRadius: Radius.md,
    gap: Spacing.s4,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.s8,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pressed: {
    opacity: 0.7,
  },
});
