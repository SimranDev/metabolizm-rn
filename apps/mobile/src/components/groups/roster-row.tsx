import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { weekdayLabel } from '@/lib/groups';
import { Radius, Spacing, useTheme, type ThemeColors } from '@/theme';
import type { GroupRosterClientDto, GroupRosterDayDto } from '@metabolizm/shared';

import { Avatar } from './avatar';

const BUCKET_LABEL: Record<GroupRosterClientDto['bucket'], string> = {
  'on-track': 'On track',
  slipping: 'Slipping',
  'off-track': 'Off track',
};

function bucketColor(
  bucket: GroupRosterClientDto['bucket'],
  colors: ThemeColors,
): string {
  if (bucket === 'on-track') return colors.successText;
  if (bucket === 'slipping') return colors.macroCarbsText;
  return colors.dangerText;
}

/**
 * One client on the coach roster. Booleans only — the coach sees compliance,
 * not the client's absolute numbers, and the API enforces that regardless of
 * what the client shares with the rest of the group.
 */
export function RosterRow({
  client,
  onPress,
}: {
  client: GroupRosterClientDto;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const logged = client.days.filter((day) => day.logged).length;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Avatar name={client.name} image={client.image} size={36} />

      <View style={styles.body}>
        <View style={styles.head}>
          <ThemedText type="smBold" numberOfLines={1} style={styles.name}>
            {client.name}
          </ThemedText>
          <ThemedText
            type="micro"
            style={{ color: bucketColor(client.bucket, colors) }}>
            {BUCKET_LABEL[client.bucket]}
          </ThemedText>
        </View>

        <View style={styles.dots}>
          {client.days.map((day) => (
            <DayDot key={day.date} day={day} />
          ))}
          <View style={styles.spacer} />
          {client.adherence7dPct !== null ? (
            <ThemedText type="smBold" themeColor="inkStrong" tabular>
              {`${client.adherence7dPct}%`}
            </ThemedText>
          ) : null}
        </View>

        <ThemedText type="sm" themeColor="textSecondary" tabular>
          {`Logged ${logged} of ${client.days.length} days`}
        </ThemedText>
      </View>

      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right' }}
        size={14}
        tintColor={colors.textTertiary}
        fallback={<View />}
      />
    </Pressable>
  );
}

/** A day in the 7-day strip: hit targets, partial, missed, or never logged. */
function DayDot({ day }: { day: GroupRosterDayDto }) {
  const { colors } = useTheme();
  const color = !day.logged
    ? colors.ringTrack
    : day.adherent === true
      ? colors.success
      : day.adherent === false
        ? colors.danger
        : colors.borderStrong;

  return (
    <View
      accessibilityLabel={`${weekdayLabel(day.date)}: ${
        !day.logged ? 'no log' : day.adherent === true ? 'hit targets' : day.adherent === false ? 'missed' : 'logged'
      }`}
      style={[styles.dot, { backgroundColor: color }]}
    />
  );
}

/** Legend for the dot strip, shown once above the roster. */
export function RosterLegend() {
  const { colors } = useTheme();
  const items = [
    { label: 'Hit targets', color: colors.success },
    { label: 'Logged', color: colors.borderStrong },
    { label: 'Missed', color: colors.danger },
    { label: 'No log', color: colors.ringTrack },
  ];

  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: item.color }]} />
          <ThemedText type="sm" themeColor="textTertiary">
            {item.label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s12,
    paddingVertical: Spacing.s12,
  },
  body: {
    flex: 1,
    gap: Spacing.s4,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.s8,
  },
  name: {
    flex: 1,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s4,
  },
  spacer: {
    flex: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: Radius.sm / 2,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.s12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s4,
  },
  pressed: {
    opacity: 0.7,
  },
});
