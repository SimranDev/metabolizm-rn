import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/ui/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { StatNumber } from '@/components/ui/stat-number';
import { Spacing, useTheme } from '@/theme';

type Props = {
  hoursFasted: number;
  goalHours: number;
  lastMeal: string;
};

const formatHours = (hours: number) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
};

/** Time since the last logged meal against a 16:8-style fasting window. */
export function FastingCard({ hoursFasted, goalHours, lastMeal }: Props) {
  const { colors } = useTheme();
  const remaining = Math.max(goalHours - hoursFasted, 0);

  return (
    <Card
      accessible
      accessibilityLabel={`Fasting ${formatHours(hoursFasted)} of a ${goalHours} hour window, ${remaining > 0 ? `${formatHours(remaining)} to go` : 'window complete'}`}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <SymbolView
            name={{ ios: 'timer', android: 'timer' }}
            size={15}
            tintColor={colors.primary}
            fallback={<View />}
          />
          <ThemedText type="micro" themeColor="textSecondary">
            Fasting
          </ThemedText>
        </View>
        <ThemedText type="sm" themeColor="textSecondary" tabular>
          16:8 window
        </ThemedText>
      </View>

      <StatNumber value={formatHours(hoursFasted)} suffix={`  of ${goalHours} h`} size="sm" />

      <ProgressBar fraction={hoursFasted / goalHours} />

      <ThemedText type="sm" themeColor="textSecondary" tabular>
        {remaining > 0 ? `${formatHours(remaining)} to go` : 'Window complete'} · last meal{' '}
        {lastMeal}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s4,
  },
});
