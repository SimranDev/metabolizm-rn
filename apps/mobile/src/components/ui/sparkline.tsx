import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Dependency-free line sparkline: each segment between consecutive points is a
 * thin View rotated about its center. ~2 Views per data point, laid out once —
 * no SVG or chart library, per the app's size/performance priority.
 */

const STROKE = 2;
const DOT = 8;
/** Keeps the line and end dot clear of the container edges. */
const INSET = DOT / 2 + 1;

type Props = {
  data: number[];
  color: string;
  height?: number;
  accessibilityLabel?: string;
};

export function Sparkline({ data, color, height = 72, accessibilityLabel }: Props) {
  const [width, setWidth] = useState(0);

  const ready = width > 0 && data.length >= 2;
  let points: { x: number; y: number }[] = [];
  if (ready) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    // Pad the domain so a near-flat series still shows gentle movement instead
    // of a line glued to the edges.
    const pad = Math.max((max - min) * 0.15, 0.2);
    const lo = min - pad;
    const span = max - min + 2 * pad;
    const innerW = width - 2 * INSET;
    const innerH = height - 2 * INSET;
    points = data.map((v, i) => ({
      x: INSET + (i / (data.length - 1)) * innerW,
      y: INSET + (1 - (v - lo) / span) * innerH,
    }));
  }

  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}>
      {points.slice(1).map((p, i) => {
        const prev = points[i];
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        const length = Math.hypot(dx, dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <View
            key={i}
            style={[
              styles.segment,
              {
                backgroundColor: color,
                width: length,
                left: (prev.x + p.x) / 2 - length / 2,
                top: (prev.y + p.y) / 2 - STROKE / 2,
                transform: [{ rotate: `${angle}deg` }],
              },
            ]}
          />
        );
      })}
      {ready && (
        <View
          style={[
            styles.dot,
            {
              backgroundColor: color,
              left: points[points.length - 1].x - DOT / 2,
              top: points[points.length - 1].y - DOT / 2,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    position: 'absolute',
    height: STROKE,
    borderRadius: STROKE / 2,
  },
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
});
