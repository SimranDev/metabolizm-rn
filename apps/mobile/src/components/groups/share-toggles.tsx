import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { SHARE_DIMENSIONS } from '@/lib/groups';
import { haptics } from '@/lib/haptics';
import { Radius, Spacing, useTheme } from '@/theme';
import type { GroupShareConfig } from '@metabolizm/shared';

type Props = {
  value: GroupShareConfig;
  onChange: (next: GroupShareConfig) => void;
};

/**
 * The share toggles, used by both the join-consent screen and the per-group
 * settings sheet so the two can never drift.
 *
 * `adherenceOnly` sits in its own block because it overrides the numeric
 * toggles rather than joining them: with it on, the group sees hit/missed
 * against targets and no absolute numbers, so those rows are disabled to show
 * they no longer apply — their stored values are left untouched, ready for
 * when it's turned back off.
 */
export function ShareToggles({ value, onChange }: Props) {
  const { colors } = useTheme();
  const [adherence, ...rest] = SHARE_DIMENSIONS;
  const numericMuted = value.adherenceOnly;

  const set = (key: keyof GroupShareConfig, next: boolean) => {
    haptics.select();
    onChange({ ...value, [key]: next });
  };

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.primary,
          { borderColor: colors.border, backgroundColor: colors.surfaceSunken },
        ]}>
        <Row
          label={adherence.label}
          hint={adherence.hint}
          value={value.adherenceOnly}
          onChange={(next) => set('adherenceOnly', next)}
        />
      </View>

      <View style={[styles.list, { borderColor: colors.border }]}>
        {rest.map((dimension, index) => {
          // Streaks and meal names survive adherenceOnly — neither is a number.
          const muted =
            numericMuted &&
            dimension.key !== 'streaks' &&
            dimension.key !== 'mealNames';
          return (
            <View
              key={dimension.key}
              style={[
                styles.row,
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}>
              <Row
                label={dimension.label}
                hint={muted ? 'Hidden while adherence only is on' : dimension.hint}
                value={value[dimension.key] && !muted}
                disabled={muted}
                onChange={(next) => set(dimension.key, next)}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Row({
  label,
  hint,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.rowInner, disabled && styles.disabled]}>
      <View style={styles.text}>
        <ThemedText type="smBold">{label}</ThemedText>
        <ThemedText type="sm" themeColor="textTertiary">
          {hint}
        </ThemedText>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: colors.actionPrimary, false: colors.ringTrack }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.s16,
  },
  primary: {
    padding: Spacing.s12,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  list: {
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: Spacing.s12,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s16,
    paddingVertical: Spacing.s12,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  disabled: {
    opacity: 0.5,
  },
});
