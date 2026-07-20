import { StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/ui/progress-bar';
import type { ScoreFactor } from '@/components/dashboard/sample-data';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { StatNumber } from '@/components/ui/stat-number';
import { Spacing } from '@/theme';

type Props = {
  total: number;
  /** Change vs yesterday; positive is up. */
  delta: number;
  factors: readonly ScoreFactor[];
};

/**
 * Composite daily "metabolic score" (Whoop/Oura-style): one number a user can
 * check in a glance, with the contributing factors broken out beside it.
 */
export function ScoreCard({ total, delta, factors }: Props) {
  const deltaText = `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} vs yesterday`;

  return (
    <Card
      accessible
      accessibilityLabel={`Metabolic score ${total} of 100, ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)} from yesterday`}>
      <View style={styles.header}>
        <ThemedText type="micro" themeColor="textSecondary">
          Metabolic score
        </ThemedText>
        <ThemedText type="sm" themeColor="textSecondary" tabular>
          {deltaText}
        </ThemedText>
      </View>

      <View style={styles.body}>
        <View style={styles.scoreBlock}>
          <StatNumber value={total} suffix="/100" size="xl" />
        </View>

        <View style={styles.factors}>
          {factors.map((factor) => (
            <View key={factor.label} style={styles.factor}>
              <View style={styles.factorRow}>
                <ThemedText type="sm" themeColor="textSecondary">
                  {factor.label}
                </ThemedText>
                <ThemedText type="smBold" tabular>
                  {factor.value}
                </ThemedText>
              </View>
              <ProgressBar fraction={factor.value / 100} height={4} />
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s24,
  },
  scoreBlock: {
    justifyContent: 'center',
  },
  factors: {
    flex: 1,
    gap: Spacing.s8,
  },
  factor: {
    gap: 2,
  },
  factorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
});
