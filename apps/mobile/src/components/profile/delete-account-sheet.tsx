import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deleteAccount } from '@/lib/session';
import { Radius, Spacing, useTheme } from '@/theme';

/** What has to be typed to arm the button. Compared case-insensitively. */
const CONFIRM_WORD = 'DELETE';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Confirmation for deleting the account. A plain RN `Modal`, matching
 * log-weight-sheet.tsx — no sheet library.
 *
 * The typed word is the point of the screen. An `Alert` with a red button is
 * one mis-tap away from erasing years of logged history that has no undo and no
 * export, and RN's `Alert.prompt` is iOS-only, so the confirmation has to be a
 * real field. It is also why this lists what goes rather than asking "are you
 * sure?": the honest deterrent is the inventory.
 */
export function DeleteAccountSheet({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const close = () => {
    if (deleting) return;
    setTyped('');
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (!armed || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      // Only wipes this device once the server confirms the row is gone; a
      // failure here leaves the account and its data completely intact.
      await deleteAccount();
      // No navigation to do: clearing the profile flips the root Stack back to
      // the onboarding group, unmounting this modal with it.
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not delete your account.',
      );
      setDeleting(false);
    }
  };

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
              Delete your account?
            </ThemedText>

            <ThemedText type="body" themeColor="textSecondary">
              This permanently removes your food diary, weight history, goals and
              targets, custom foods, and your membership of every group. It cannot
              be undone and there is no way to restore it.
            </ThemedText>

            <ThemedText type="sm" themeColor="textTertiary">
              Groups you own pass to their longest-standing member. A group with
              nobody else left in it is deleted too.
            </ThemedText>

            <Input
              label={`TYPE ${CONFIRM_WORD} TO CONFIRM`}
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleting}
              placeholder={CONFIRM_WORD}
              accessibilityLabel={`Type ${CONFIRM_WORD} to confirm`}
            />

            {error && (
              <ThemedText type="sm" themeColor="dangerText">
                {error}
              </ThemedText>
            )}

            <Button
              label={deleting ? 'Deleting…' : 'Delete my account'}
              variant="danger"
              onPress={confirm}
              disabled={!armed || deleting}
              fullWidth
              size="lg"
            />
            <Button label="Cancel" variant="ghost" onPress={close} disabled={deleting} fullWidth />
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
});
