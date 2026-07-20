import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/theme';

/** Up to two initials from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

type Props = {
  name: string;
  image?: string | null;
  size?: number;
  /** Ring in the surface color, so stacked avatars read as separate discs. */
  ringColor?: string;
};

/**
 * Member avatar: their photo, or their initials on the sunken surface.
 * Deliberately uncolored — `accent` is reserved for active states and
 * `macro*` for macro visuals, so neither may identify a person.
 */
export function Avatar({ name, image, size = 32, ringColor }: Props) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.surfaceSunken,
          borderColor: ringColor ?? colors.border,
        },
      ]}>
      {image ? (
        <Image
          source={{ uri: image }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          accessibilityLabel={name}
        />
      ) : (
        <ThemedText
          type="micro"
          themeColor="textSecondary"
          style={{ fontSize: Math.max(9, size * 0.34) }}>
          {initials(name)}
        </ThemedText>
      )}
    </View>
  );
}

type StackProps = {
  members: { userId: string; name: string; image: string | null }[];
  size?: number;
  max?: number;
  /** Total member count, so the overflow chip can count everyone. */
  total?: number;
};

/** Overlapping avatar row with a "+n" chip once the list runs past `max`. */
export function AvatarStack({ members, size = 28, max = 4, total }: StackProps) {
  const { colors } = useTheme();
  const shown = members.slice(0, max);
  const overflow = (total ?? members.length) - shown.length;

  return (
    <View style={styles.stack}>
      {shown.map((member, i) => (
        <View key={member.userId} style={i > 0 ? { marginLeft: -size / 3 } : null}>
          <Avatar
            name={member.name}
            image={member.image}
            size={size}
            ringColor={colors.surface}
          />
        </View>
      ))}
      {overflow > 0 ? (
        <View
          style={[
            styles.avatar,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: -size / 3,
              backgroundColor: colors.surfaceSunken,
              borderColor: colors.surface,
            },
          ]}>
          <ThemedText
            type="micro"
            themeColor="textTertiary"
            tabular
            style={{ fontSize: Math.max(9, size * 0.3) }}>
            {`+${overflow}`}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    overflow: 'hidden',
  },
  stack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
