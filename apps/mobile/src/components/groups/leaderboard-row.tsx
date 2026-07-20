import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/dashboard/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Spacing, useTheme } from '@/theme';
import type { GroupLeaderboardEntryDto } from '@metabolizm/shared';

import { Avatar } from './avatar';

type Props = {
  entry: GroupLeaderboardEntryDto;
  /** Days of the week that have actually happened — the denominator in the copy. */
  elapsed: number;
  isMe: boolean;
  onPress: () => void;
};

/**
 * One rank on the weekly consistency board.
 *
 * The percentage is always paired with "logged n of m days": unlogged past
 * days count as zero, so an early or patchy week reads low by design and the
 * bare number alone would look like a judgement rather than a count.
 */
export function LeaderboardRow({ entry, elapsed, isMe, onPress }: Props) {
  const { colors } = useTheme();
  const pct = entry.adherencePct;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <ThemedText type="smBold" themeColor="textTertiary" tabular style={styles.rank}>
        {entry.rank}
      </ThemedText>
      <Avatar name={entry.name} image={entry.image} size={32} />

      <View style={styles.body}>
        <View style={styles.head}>
          <ThemedText type="smBold" numberOfLines={1} style={styles.name}>
            {isMe ? 'You' : entry.name}
          </ThemedText>
          {pct !== null ? (
            <ThemedText type="h3" themeColor="inkStrong" tabular>
              {`${pct}%`}
            </ThemedText>
          ) : (
            <ThemedText type="sm" themeColor="textTertiary">
              No targets set
            </ThemedText>
          )}
        </View>

        <ProgressBar fraction={(pct ?? 0) / 100} height={6} />

        <View style={styles.meta}>
          <ThemedText type="sm" themeColor="textSecondary" tabular>
            {`Logged ${entry.daysLogged} of ${elapsed} ${elapsed === 1 ? 'day' : 'days'}`}
          </ThemedText>
          {entry.streak !== undefined && entry.streak > 0 ? (
            <View style={styles.streak}>
              <SymbolView
                name={{ ios: 'flame.fill', android: 'local_fire_department' }}
                size={11}
                tintColor={colors.textTertiary}
                fallback={<View />}
              />
              <ThemedText type="sm" themeColor="textTertiary" tabular>
                {`${entry.streak}-day streak`}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s12,
    paddingVertical: Spacing.s12,
  },
  rank: {
    width: 18,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    gap: Spacing.s4,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.s8,
  },
  name: {
    flex: 1,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.s8,
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s4,
  },
  pressed: {
    opacity: 0.7,
  },
});
