import { StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/ui/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Spacing, useTheme } from '@/theme';
import { macroColor, macroTextColor, type MacroKind } from '@/theme/palette';

type Line = {
  macro: MacroKind;
  label: string;
  grams: number;
  /** Absent when the member shares macros but has no target set. */
  target: number | null;
};

/**
 * Protein / carbs / fat against targets. Rendered only when the member shares
 * macros — the caller decides; this component never guesses a missing value.
 * Macro colors are an allowed `macro*` role here.
 */
export function MacroLines({ lines }: { lines: Line[] }) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      {lines.map((line) => (
        <View key={line.macro} style={styles.line}>
          <View style={styles.row}>
            <ThemedText type="micro" style={{ color: macroTextColor(colors, line.macro) }}>
              {line.label}
            </ThemedText>
            <ThemedText type="smBold" themeColor="text" tabular>
              {line.target !== null
                ? `${Math.round(line.grams)} / ${Math.round(line.target)}g`
                : `${Math.round(line.grams)}g`}
            </ThemedText>
          </View>
          <ProgressBar
            fraction={line.target ? line.grams / line.target : 0}
            color={macroColor(colors, line.macro)}
            height={6}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.s12,
  },
  line: {
    gap: Spacing.s4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
});
