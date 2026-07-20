import { StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/ui/progress-bar';
import type { MicroSample } from '@/components/dashboard/sample-data';
import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Spacing, useTheme } from '@/theme';

type Props = {
  micros: readonly MicroSample[];
};

/**
 * Micronutrient watch — the "micro" half of the app's core tracking. Two row
 * kinds: `goal` rows fill toward a target, `limit` rows track headroom under a
 * cap (neutral, turning red once ~90% of the cap is gone).
 */
export function MicrosCard({ micros }: Props) {
  const { colors } = useTheme();

  return (
    <Card>
      <View style={styles.header}>
        <ThemedText type="micro" themeColor="textSecondary">
          Micronutrients
        </ThemedText>
        <ThemedText type="sm" themeColor="textSecondary">
          vs daily targets
        </ThemedText>
      </View>

      {micros.map((micro) => {
        const fraction = micro.target > 0 ? micro.consumed / micro.target : 0;
        const isLimit = micro.kind === 'limit';
        const fill = isLimit
          ? fraction >= 0.9
            ? colors.danger
            : colors.borderStrong
          : colors.primary;
        return (
          <View
            key={micro.label}
            style={styles.row}
            accessible
            accessibilityLabel={`${micro.label}: ${micro.consumed} of ${micro.target} ${micro.unit} ${isLimit ? 'limit' : 'goal'}`}>
            <View style={styles.rowHeader}>
              <ThemedText type="smBold">{micro.label}</ThemedText>
              {isLimit && <Badge label="Limit" size="sm" />}
              <View style={styles.spacer} />
              <ThemedText type="sm" tabular>
                {micro.consumed.toLocaleString()}
                <ThemedText type="sm" themeColor="textSecondary" tabular>
                  {' '}
                  / {micro.target.toLocaleString()} {micro.unit}
                </ThemedText>
              </ThemedText>
            </View>
            <ProgressBar fraction={fraction} color={fill} height={5} />
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
    gap: Spacing.s8,
  },
  spacer: {
    flex: 1,
  },
});
