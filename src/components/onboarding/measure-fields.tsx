import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  cmToFtIn,
  ftInToCm,
  fromKg,
  type HeightUnit,
  kgToStLb,
  stLbToKg,
  toKg,
  type WeightUnit,
} from '@/lib/health';

import { UnitToggle } from './unit-toggle';

const round1 = (n: number) => Math.round(n * 10) / 10;
const num = (s: string) => {
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
};

function BigInput({
  value,
  onChangeText,
  suffix,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  suffix: string;
  placeholder?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.inputRow}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text }]}
        maxLength={5}
      />
      <ThemedText type="subtitle" themeColor="textSecondary">
        {suffix}
      </ThemedText>
    </View>
  );
}

/**
 * Weight entry with a kg / lb / st toggle. Emits canonical kilograms.
 *
 * Parents pass `key={unit}` so switching units remounts the field and re-seeds
 * the text from the canonical value via the lazy initializers below — no effect,
 * no cascading renders.
 */
export function WeightField({
  unit,
  onUnitChange,
  valueKg,
  onChange,
}: {
  unit: WeightUnit;
  onUnitChange: (u: WeightUnit) => void;
  valueKg?: number;
  onChange: (kg: number | undefined) => void;
}) {
  const [primary, setPrimary] = useState(() => {
    if (valueKg == null) return '';
    return unit === 'st' ? String(kgToStLb(valueKg).st) : String(round1(fromKg(valueKg, unit)));
  });
  const [pounds, setPounds] = useState(() =>
    valueKg != null && unit === 'st' ? String(kgToStLb(valueKg).lb) : '',
  );

  const emit = (p: string, lb: string) => {
    if (unit === 'st') {
      const st = num(p);
      const l = num(lb);
      if (Number.isNaN(st) && Number.isNaN(l)) return onChange(undefined);
      return onChange(stLbToKg(Number.isNaN(st) ? 0 : st, Number.isNaN(l) ? 0 : l));
    }
    const v = num(p);
    onChange(Number.isNaN(v) ? undefined : toKg(v, unit));
  };

  return (
    <View style={styles.field}>
      {unit === 'st' ? (
        <View style={styles.stRow}>
          <BigInput
            value={primary}
            onChangeText={(t) => {
              setPrimary(t);
              emit(t, pounds);
            }}
            suffix="st"
            placeholder="0"
          />
          <BigInput
            value={pounds}
            onChangeText={(t) => {
              setPounds(t);
              emit(primary, t);
            }}
            suffix="lb"
            placeholder="0"
          />
        </View>
      ) : (
        <BigInput
          value={primary}
          onChangeText={(t) => {
            setPrimary(t);
            emit(t, pounds);
          }}
          suffix={unit}
          placeholder="0"
        />
      )}
      <UnitToggle
        options={[
          { label: 'kg', value: 'kg' },
          { label: 'lb', value: 'lb' },
          { label: 'st', value: 'st' },
        ]}
        value={unit}
        onChange={onUnitChange}
      />
    </View>
  );
}

/** Height entry with a cm / ft-in toggle. Emits canonical centimetres. */
export function HeightField({
  unit,
  onUnitChange,
  valueCm,
  onChange,
}: {
  unit: HeightUnit;
  onUnitChange: (u: HeightUnit) => void;
  valueCm?: number;
  onChange: (cm: number | undefined) => void;
}) {
  const [primary, setPrimary] = useState(() => {
    if (valueCm == null) return '';
    return unit === 'ftin' ? String(cmToFtIn(valueCm).ft) : String(Math.round(valueCm));
  });
  const [inches, setInches] = useState(() =>
    valueCm != null && unit === 'ftin' ? String(cmToFtIn(valueCm).in) : '',
  );

  const emit = (p: string, inch: string) => {
    if (unit === 'ftin') {
      const ft = num(p);
      const i = num(inch);
      if (Number.isNaN(ft) && Number.isNaN(i)) return onChange(undefined);
      return onChange(ftInToCm(Number.isNaN(ft) ? 0 : ft, Number.isNaN(i) ? 0 : i));
    }
    const v = num(p);
    onChange(Number.isNaN(v) ? undefined : v);
  };

  return (
    <View style={styles.field}>
      {unit === 'ftin' ? (
        <View style={styles.stRow}>
          <BigInput
            value={primary}
            onChangeText={(t) => {
              setPrimary(t);
              emit(t, inches);
            }}
            suffix="ft"
            placeholder="0"
          />
          <BigInput
            value={inches}
            onChangeText={(t) => {
              setInches(t);
              emit(primary, t);
            }}
            suffix="in"
            placeholder="0"
          />
        </View>
      ) : (
        <BigInput
          value={primary}
          onChangeText={(t) => {
            setPrimary(t);
            emit(t, inches);
          }}
          suffix="cm"
          placeholder="0"
        />
      )}
      <UnitToggle
        options={[
          { label: 'cm', value: 'cm' },
          { label: 'ft/in', value: 'ftin' },
        ]}
        value={unit}
        onChange={onUnitChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.four, alignItems: 'center' },
  stRow: { flexDirection: 'row', gap: Spacing.four },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  input: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 44,
    minWidth: 90,
    textAlign: 'right',
  },
});
