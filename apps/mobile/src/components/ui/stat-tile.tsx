import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/ui/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { StatNumber } from '@/components/ui/stat-number';
import { Spacing, useTheme, type ThemeColors } from '@/theme';

type Props = {
  icon: SymbolViewProps['name'];
  label: string;
  value: string;
  sub?: string;
  /** Icon color. Defaults to primary. */
  tint?: keyof ThemeColors;
  /** Optional mini progress toward a goal, 0–1 (accent fill). */
  progress?: number;
};

/** Small dashboard stat: icon + label header, big value, optional sub/progress. */
export function StatTile({ icon, label, value, sub, tint = 'primary', progress }: Props) {
  const { colors } = useTheme();

  return (
    <Card style={styles.tile}>
      <View style={styles.header}>
        <SymbolView name={icon} size={16} tintColor={colors[tint]} fallback={<View />} />
        <ThemedText type="sm" themeColor="textSecondary" numberOfLines={1}>
          {label}
        </ThemedText>
      </View>
      <StatNumber value={value} size="sm" />
      {sub !== undefined && (
        <ThemedText type="sm" themeColor="textSecondary" numberOfLines={1} tabular>
          {sub}
        </ThemedText>
      )}
      {progress !== undefined && <ProgressBar fraction={progress} height={6} />}
    </Card>
  );
}

/** Two-column wrapping grid for StatTiles. */
export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.s8,
  },
  tile: {
    flexBasis: '46%',
    flexGrow: 1,
    gap: Spacing.s4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s4,
  },
});
