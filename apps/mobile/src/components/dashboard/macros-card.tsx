import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/ui/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { macroColor, Spacing, useTheme, type MacroKind } from '@/theme';
import type { Macros } from '@metabolizm/shared';

type Row = {
  key: keyof Macros;
  label: string;
  icon: SymbolViewProps['name'];
  macro: MacroKind;
};

/** Protein first — it's the anchor of every plan (see `macrosFor`). */
const ROWS: Row[] = [
  {
    key: 'proteinG',
    label: 'Protein',
    icon: { ios: 'dumbbell.fill', android: 'fitness_center' },
    macro: 'protein',
  },
  { key: 'carbsG', label: 'Carbs', icon: { ios: 'leaf.fill', android: 'eco' }, macro: 'carbs' },
  { key: 'fatG', label: 'Fat', icon: { ios: 'drop.fill', android: 'water_drop' }, macro: 'fat' },
];

type Props = {
  consumed: Macros;
  targets: Macros;
};

/** Grams consumed vs the plan's macro targets, one labeled bar per macro. */
export function MacrosCard({ consumed, targets }: Props) {
  const { colors } = useTheme();

  return (
    <Card>
      <View style={styles.header}>
        <ThemedText type="micro" themeColor="textSecondary">
          Macros
        </ThemedText>
        <ThemedText type="sm" themeColor="textSecondary">
          vs plan targets
        </ThemedText>
      </View>

      {ROWS.map(({ key, label, icon, macro }) => {
        const eaten = consumed[key];
        const target = targets[key];
        const fill = macroColor(colors, macro);
        return (
          <View
            key={key}
            style={styles.row}
            accessible
            accessibilityLabel={`${label}: ${Math.round(eaten)} of ${Math.round(target)} grams`}>
            <View style={styles.rowHeader}>
              <SymbolView name={icon} size={15} tintColor={fill} fallback={<View />} />
              <ThemedText type="smBold">{label}</ThemedText>
              <View style={styles.spacer} />
              <ThemedText type="smBold" tabular>
                {Math.round(eaten)}
                <ThemedText type="sm" themeColor="textSecondary" tabular>
                  {' '}
                  / {Math.round(target)} g
                </ThemedText>
              </ThemedText>
            </View>
            <ProgressBar fraction={target > 0 ? eaten / target : 0} color={fill} />
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  row: {
    gap: Spacing.s4,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s4,
  },
  spacer: {
    flex: 1,
  },
});
