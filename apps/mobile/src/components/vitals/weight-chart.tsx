import type { WeightSeriesPoint, WeightUnit } from '@metabolizm/shared';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { haptics } from '@/lib/haptics';
import { formatWeight, formatWeightValue } from '@/lib/weight';
import { fromKg } from '@/lib/health';
import { Radius, Spacing, useTheme } from '@/theme';

const HEIGHT = 200;
/** Room for the y-axis labels on the left and the goal pill on the right. */
const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;
/** Vertical breathing room so the line never touches the frame. */
const DOMAIN_PAD = 0.08;
const Y_TICKS = 4;

type Props = {
  points: WeightSeriesPoint[];
  unit: WeightUnit;
  goalKg?: number | null;
  /** Axis label granularity, from the server's chosen bucket. */
  bucket: 'day' | 'week' | 'month';
};

/**
 * Weight over time: line, soft area fill, dashed goal line, and a scrub
 * crosshair.
 *
 * Rendered with react-native-svg rather than a chart library — Skia and the
 * charting packages built on it add 4–6 MB to the download, which loses to
 * this app's size-first priority for one screen. The trade-off is that path
 * building and the domain math live here.
 */
export function WeightChart({ points, unit, goalKg, bucket }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  // Scrub position lives in a shared value so dragging never re-renders React;
  // only a CHANGE of selected point crosses back to JS.
  const scrubX = useSharedValue(-1);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  /** Last committed data index, so the haptic fires per point, not per frame. */
  const lastIndex = useSharedValue(-1);

  // Unit conversion happens exactly once here, not per point in render.
  const geometry = useMemo(() => {
    if (width <= 0 || points.length === 0) return null;

    const values = points.map((p) => fromKg(p.kg, unit));
    const goal = goalKg == null ? null : fromKg(goalKg, unit);

    // The domain always includes the goal, so the dashed line can't fall off
    // the top or bottom of the frame.
    const candidates = goal === null ? values : [...values, goal];
    let min = Math.min(...candidates);
    let max = Math.max(...candidates);
    const span = max - min;
    // A perfectly flat series would collapse to a zero-height domain.
    const pad = Math.max(span * DOMAIN_PAD, 0.3);
    min -= pad;
    max += pad;

    const plotW = Math.max(width - PAD_LEFT - PAD_RIGHT, 1);
    const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const x = (i: number) =>
      PAD_LEFT + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const y = (v: number) => PAD_TOP + (1 - (v - min) / (max - min)) * plotH;

    const coords = values.map((v, i) => ({ x: x(i), y: y(v) }));

    // Catmull-Rom control points converted to cubic béziers: a weight series
    // is sampled daily and reads as a trend, so a smooth curve is honest here
    // in a way it wouldn't be for discrete event data.
    let line = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i += 1) {
      const p0 = coords[i - 1] ?? coords[i];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      line += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    }

    const baseline = PAD_TOP + plotH;
    const area = `${line} L ${coords[coords.length - 1].x} ${baseline} L ${coords[0].x} ${baseline} Z`;

    const ticks = Array.from({ length: Y_TICKS }, (_, i) => {
      const v = min + ((max - min) * i) / (Y_TICKS - 1);
      return { v, y: y(v) };
    });

    return { coords, line, area, ticks, goalY: goal === null ? null : y(goal), plotW };
  }, [points, unit, goalKg, width]);

  const commitIndex = (index: number | null) => setActiveIndex(index);

  const count = points.length;
  const pickIndex = (px: number) => {
    'worklet';
    if (count === 0 || width <= 0) return -1;
    const plotW = Math.max(width - PAD_LEFT - PAD_RIGHT, 1);
    const ratio = (px - PAD_LEFT) / plotW;
    return Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))));
  };

  // Built in the render body rather than a useMemo: the React Compiler treats
  // a useMemo body as render code, which makes writing to a shared value (and
  // reading a clock) inside these worklets a rule violation. Gesture.Pan() is
  // cheap to construct and GestureDetector diffs it.
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      const i = pickIndex(e.x);
      if (i < 0) return;
      scrubX.value = e.x;
      lastIndex.value = i;
      runOnJS(commitIndex)(i);
    })
    .onUpdate((e) => {
      'worklet';
      const i = pickIndex(e.x);
      if (i < 0) return;
      scrubX.value = e.x;
      // The crosshair follows the finger every frame on the UI thread; React
      // only hears about it when the selected POINT changes. That's a handful
      // of state updates per drag instead of one per frame, and it makes the
      // haptic land once per data point — which is what the tick should mean.
      if (i !== lastIndex.value) {
        lastIndex.value = i;
        runOnJS(haptics.select)();
        runOnJS(commitIndex)(i);
      }
    })
    .onFinalize(() => {
      'worklet';
      scrubX.value = -1;
      lastIndex.value = -1;
      runOnJS(commitIndex)(null);
    });

  const crosshair = useAnimatedStyle(() => ({
    opacity: scrubX.value < 0 ? 0 : 1,
    transform: [{ translateX: scrubX.value }],
  }));

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { borderColor: colors.border }]}>
        <ThemedText type="body" themeColor="textSecondary" style={styles.centered}>
          No weigh-ins in this range yet.
        </ThemedText>
      </View>
    );
  }

  const active = activeIndex === null ? null : points[activeIndex];

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Tooltip sits above the frame rather than following the finger, so it
          is never hidden under the hand that's scrubbing. */}
      <View style={styles.tooltipRow}>
        {active ? (
          <View style={[styles.tooltip, { backgroundColor: colors.surfaceSunken }]}>
            <ThemedText type="sm" themeColor="inkStrong" tabular>
              {axisLabel(active.d, bucket)} · {formatWeight(active.kg, unit)}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.tooltipSpacer} />
        )}
      </View>

      <GestureDetector gesture={pan}>
        <View>
          {geometry ? (
            <Svg width="100%" height={HEIGHT}>
              <Defs>
                <LinearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.primary} stopOpacity={0.18} />
                  <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              <G>
                {geometry.ticks.map((tick) => (
                  <Line
                    key={tick.v}
                    x1={PAD_LEFT}
                    y1={tick.y}
                    x2="100%"
                    y2={tick.y}
                    stroke={colors.border}
                    strokeWidth={StyleSheet.hairlineWidth}
                  />
                ))}
              </G>

              <Path d={geometry.area} fill="url(#weightFill)" />
              <Path
                d={geometry.line}
                stroke={colors.primary}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />

              {geometry.goalY !== null && (
                <Line
                  x1={PAD_LEFT}
                  y1={geometry.goalY}
                  x2="100%"
                  y2={geometry.goalY}
                  stroke={colors.accentText}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
              )}
            </Svg>
          ) : (
            <View style={{ height: HEIGHT }} />
          )}

          <Animated.View
            pointerEvents="none"
            style={[styles.crosshair, { backgroundColor: colors.borderStrong }, crosshair]}
          />
        </View>
      </GestureDetector>

      {/* Axis labels are plain Text, not SVG <Text> — they inherit the app's
          font stack and tabular numerals for free. */}
      {geometry && (
        <View pointerEvents="none" style={styles.yAxis}>
          {geometry.ticks.map((tick) => (
            <ThemedText
              key={tick.v}
              type="micro"
              themeColor="textTertiary"
              tabular
              style={[styles.yLabel, { top: tick.y - 7 }]}>
              {tick.v.toFixed(0)}
            </ThemedText>
          ))}
        </View>
      )}

      <View style={styles.xAxis}>
        <ThemedText type="micro" themeColor="textTertiary">
          {axisLabel(points[0].d, bucket)}
        </ThemedText>
        {goalKg != null && (
          <ThemedText type="micro" themeColor="accentText" tabular>
            goal {formatWeightValue(goalKg, unit)}
          </ThemedText>
        )}
        <ThemedText type="micro" themeColor="textTertiary">
          {axisLabel(points[points.length - 1].d, bucket)}
        </ThemedText>
      </View>
    </View>
  );
}

/** Bucketed points are labelled by their START date — say so in month form. */
function axisLabel(iso: string, bucket: 'day' | 'week' | 'month'): string {
  const date = new Date(`${iso}T00:00:00`);
  if (bucket === 'month') {
    return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  empty: {
    height: HEIGHT,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.s16,
  },
  centered: {
    textAlign: 'center',
  },
  tooltipRow: {
    alignItems: 'center',
    minHeight: 28,
    justifyContent: 'center',
  },
  tooltip: {
    paddingHorizontal: Spacing.s12,
    paddingVertical: Spacing.s4,
    borderRadius: Radius.pill,
  },
  tooltipSpacer: {
    height: 28,
  },
  crosshair: {
    position: 'absolute',
    left: 0,
    top: PAD_TOP,
    width: 1,
    height: HEIGHT - PAD_TOP - PAD_BOTTOM,
  },
  yAxis: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Offset by the tooltip row so tick labels line up with the plot area.
    top: 28,
  },
  yLabel: {
    position: 'absolute',
    left: 0,
    width: PAD_LEFT - 6,
    textAlign: 'right',
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: PAD_LEFT,
    paddingRight: PAD_RIGHT,
    marginTop: Spacing.s4,
  },
});
