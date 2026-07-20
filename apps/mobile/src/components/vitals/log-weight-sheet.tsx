import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { fromKg, toKg } from '@/lib/health';
import { haptics } from '@/lib/haptics';
import { localDateKey, WEIGHT_UNIT_OPTIONS } from '@/lib/weight';
import { useWeight } from '@/store/weight';
import { Fonts, Radius, Spacing, useTheme } from '@/theme';

/** Matches the server's plausibility bound so a typo fails here, not on send. */
const MIN_KG = 20;
const MAX_KG = 500;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Prefills the input — usually the last logged weight. */
  prefillKg?: number | null;
};

/**
 * Bottom sheet for logging a weigh-in. A plain RN `Modal` rather than a sheet
 * library, matching components/log/unit-picker.tsx — no extra dependency.
 *
 * The unit toggle is deliberately prominent: the server's 20–500 kg guard
 * cannot catch a pound value entered as kilograms in the normal human range
 * (165 lb typed as kg is 165 kg, which is a real weight and is accepted), so
 * the unit has to be unmissable in the UI instead.
 */
export function LogWeightSheet({ visible, onClose, prefillKg }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const unit = useWeight((s) => s.unit);
  const setUnit = useWeight((s) => s.setUnit);
  const logWeight = useWeight((s) => s.logWeight);

  const [raw, setRaw] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entered = Number.parseFloat(raw.replace(',', '.'));
  const kg = Number.isFinite(entered) ? toKg(entered, unit) : null;
  const valid = kg !== null && kg > MIN_KG && kg < MAX_KG;

  const reset = () => {
    setRaw('');
    setNote('');
    setError(null);
    setSaving(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      haptics.success();
      await logWeight({
        weightKg: Math.round(kg * 100) / 100,
        entryDate: localDateKey(),
        loggedAt: new Date().toISOString(),
        note: note.trim() === '' ? null : note.trim(),
      });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that weigh-in.');
      setSaving(false);
    }
  };

  const placeholder =
    prefillKg == null ? '—' : String(Math.round(fromKg(prefillKg, unit) * 10) / 10);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.scrim }]} onPress={close}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}>
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, paddingBottom: insets.bottom + Spacing.s16 },
            ]}
            onPress={() => {}}>
            <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />

            <ThemedText type="h3" themeColor="inkStrong">
              Log weight
            </ThemedText>

            <View style={styles.inputRow}>
              <TextInput
                value={raw}
                onChangeText={setRaw}
                keyboardType="decimal-pad"
                placeholder={placeholder}
                placeholderTextColor={colors.textTertiary}
                autoFocus
                selectionColor={colors.primary}
                style={[styles.bigInput, { color: colors.inkStrong }]}
                accessibilityLabel={`Weight in ${unit}`}
              />
              <ThemedText type="h2" themeColor="textSecondary">
                {unit}
              </ThemedText>
            </View>

            <Segmented options={WEIGHT_UNIT_OPTIONS} value={unit} onChange={setUnit} />

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              placeholderTextColor={colors.textTertiary}
              maxLength={280}
              selectionColor={colors.primary}
              style={[
                styles.note,
                { backgroundColor: colors.surfaceSunken, color: colors.text },
              ]}
              accessibilityLabel="Note"
            />

            {raw !== '' && !valid && (
              <ThemedText type="sm" themeColor="dangerText">
                That doesn&apos;t look like a weight in {unit}. Check the unit above.
              </ThemedText>
            )}
            {error && (
              <ThemedText type="sm" themeColor="dangerText">
                {error}
              </ThemedText>
            )}

            <Button
              label={saving ? 'Saving…' : 'Save weigh-in'}
              onPress={save}
              disabled={!valid || saving}
              fullWidth
              size="lg"
            />
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardWrap: {
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.s24,
    paddingTop: Spacing.s8,
    gap: Spacing.s16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.s8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: Spacing.s8,
  },
  bigInput: {
    fontFamily: Fonts.displayBold,
    fontSize: 56,
    lineHeight: 64,
    minWidth: 140,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  note: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.s16,
    paddingVertical: Spacing.s12,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
});
