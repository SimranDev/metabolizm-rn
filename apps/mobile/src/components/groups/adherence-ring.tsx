import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/theme';

type Props = {
  /** 0–1; values outside are clamped. */
  fraction: number;
  /** Centered label, e.g. "76%" or "5/7". */
  label: string;
  size?: number;
  stroke?: number;
  /** Defaults to `accent` — progress indication is an allowed accent role. */
  color?: string;
};

/**
 * Progress ring, drawn with two clipped hemispheres instead of SVG — the app
 * ships no chart library (see components/dashboard/sparkline.tsx for the same
 * trade-off).
 *
 * Each hemisphere clips a full circle whose top and right borders are colored.
 * Those two borders meet the transparent ones on the 45° diagonals, so
 * together they paint a 180° arc running from 10:30 round to 4:30. Rotating
 * that arc sweeps it into or out of its hemisphere: the right half renders the
 * first 180° of progress, the left half the rest.
 */
export function AdherenceRing({
  fraction,
  label,
  size = 56,
  stroke = 5,
  color,
}: Props) {
  const { colors } = useTheme();
  const fill = color ?? colors.accent;
  const degrees = Math.max(0, Math.min(1, fraction)) * 360;
  const rightDegrees = Math.min(degrees, 180);
  const leftDegrees = Math.max(0, degrees - 180);

  const arc = {
    position: 'absolute' as const,
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: stroke,
    borderTopColor: fill,
    borderRightColor: fill,
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  };

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: size / 2,
            borderWidth: stroke,
            borderColor: colors.ringTrack,
          },
        ]}
      />

      {/* Left hemisphere: empty until progress passes the halfway mark. At
          +45° the arc sits entirely in the right half, so nothing shows. */}
      <View style={[styles.clip, { left: 0, width: size / 2, height: size }]}>
        <View
          style={[arc, { left: 0, transform: [{ rotate: `${leftDegrees + 45}deg` }] }]}
        />
      </View>

      {/* Right hemisphere: the first half of the sweep. At -135° the arc is
          parked in the left half; +45° fills the hemisphere. */}
      <View style={[styles.clip, { left: size / 2, width: size / 2, height: size }]}>
        <View
          style={[
            arc,
            { left: -size / 2, transform: [{ rotate: `${rightDegrees - 135}deg` }] },
          ]}
        />
      </View>

      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <ThemedText
          type="smBold"
          tabular
          themeColor="inkStrong"
          style={{ fontSize: size * 0.26 }}>
          {label}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
