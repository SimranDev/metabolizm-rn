import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { REACTIONS } from '@/lib/groups';
import { haptics } from '@/lib/haptics';
import { Radius, Spacing, useTheme } from '@/theme';
import type { GroupReactionDto } from '@metabolizm/shared';

type Props = {
  reactions: GroupReactionDto[];
  onReact: (token: string) => void;
};

/**
 * Reaction chips. The API stores the value as free text, so we send word
 * tokens ("strong", "fire") and render symbols — the Kinetic system has no
 * emoji. Tapping a chip toggles it; the server treats a repeat as a removal.
 */
export function ReactionRow({ reactions, onReact }: Props) {
  const byToken = new Map(reactions.map((r) => [r.emoji, r]));
  // Tokens another client sent that aren't in our set still render, so a
  // reaction never silently disappears.
  const extras = reactions.filter(
    (r) => !REACTIONS.some((known) => known.token === r.emoji),
  );

  return (
    <View style={styles.row}>
      {REACTIONS.map((reaction) => {
        const state = byToken.get(reaction.token);
        return (
          <ReactionChip
            key={reaction.token}
            icon={{ ios: reaction.ios, android: reaction.android }}
            label={reaction.label}
            count={state?.count ?? 0}
            active={state?.reactedByMe ?? false}
            onPress={() => onReact(reaction.token)}
          />
        );
      })}
      {extras.map((extra) => (
        <ReactionChip
          key={extra.emoji}
          icon={{ ios: 'hand.thumbsup.fill', android: 'thumb_up' }}
          label={extra.emoji}
          count={extra.count}
          active={extra.reactedByMe}
          onPress={() => onReact(extra.emoji)}
        />
      ))}
    </View>
  );
}

function ReactionChip({
  icon,
  label,
  count,
  active,
  onPress,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${count > 0 ? `, ${count}` : ''}`}
      accessibilityState={{ selected: active }}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.chip,
        {
          // Active reaction is an allowed accent role (an active state).
          backgroundColor: active ? colors.accent : colors.surfaceSunken,
          borderColor: active ? colors.accent : 'transparent',
        },
        pressed && styles.pressed,
      ]}>
      <SymbolView
        name={icon}
        size={13}
        tintColor={active ? colors.onAccent : colors.textSecondary}
        fallback={<View style={styles.iconSpacer} />}
      />
      {count > 0 ? (
        <ThemedText
          type="sm"
          themeColor={active ? 'onAccent' : 'textSecondary'}
          tabular>
          {count}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s4,
    paddingHorizontal: Spacing.s8,
    paddingVertical: Spacing.s4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    minWidth: 34,
    justifyContent: 'center',
  },
  iconSpacer: {
    width: 13,
    height: 13,
  },
  pressed: {
    opacity: 0.7,
  },
});
