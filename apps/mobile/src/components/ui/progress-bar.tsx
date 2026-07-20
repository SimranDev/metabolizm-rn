import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  /** 0–1; values outside the range are clamped. */
  fraction: number;
  /** Fill color. Defaults to `accent` (progress is an allowed accent role). */
  color?: string;
  height?: number;
};

/** Thin rounded progress pipe on the themed track — the app's bar primitive. */
export function ProgressBar({ fraction, color, height = 8 }: Props) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, fraction)) * 100;

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: colors.ringTrack },
      ]}>
      <View
        style={[
          styles.fill,
          { width: `${pct}%`, backgroundColor: color ?? colors.accent, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
