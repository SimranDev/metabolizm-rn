import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing, useTheme } from '@/theme';
import type { GroupCommentDto } from '@metabolizm/shared';

type Props = {
  comments: GroupCommentDto[];
  myUserId: string | null;
  /** Null when the caller may not comment (members in a trainer group). */
  onSend: ((body: string) => Promise<void>) | null;
  placeholder: string;
  /** Why commenting is unavailable, shown in place of the composer. */
  disabledNote?: string;
};

/** Comment thread plus composer, shared by the member-day and coach views. */
export function CommentThread({
  comments,
  myUserId,
  onSend,
  placeholder,
  disabledNote,
}: Props) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const canSend = draft.trim().length > 0 && !sending && onSend !== null;

  const send = async () => {
    if (!canSend || onSend === null) return;
    const body = draft.trim();
    setSending(true);
    try {
      await onSend(body);
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {comments.map((comment) => {
        const mine = comment.authorId === myUserId;
        return (
          <View
            key={comment.id}
            style={[
              styles.bubble,
              {
                backgroundColor: mine ? colors.secondary : colors.surfaceSunken,
                alignSelf: mine ? 'flex-end' : 'flex-start',
              },
            ]}>
            <ThemedText type="body" themeColor={mine ? 'onSecondary' : 'text'}>
              {comment.body}
            </ThemedText>
            <ThemedText
              type="sm"
              themeColor={mine ? 'onSecondary' : 'textTertiary'}
              style={mine ? styles.mineMeta : undefined}>
              {`${mine ? 'You' : comment.authorName} · ${timeLabel(comment.createdAt)}`}
            </ThemedText>
          </View>
        );
      })}

      {onSend === null ? (
        disabledNote ? (
          <ThemedText type="sm" themeColor="textTertiary">
            {disabledNote}
          </ThemedText>
        ) : null
      ) : (
        <View
          style={[
            styles.composer,
            { backgroundColor: colors.surfaceSunken, borderColor: colors.border },
          ]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor={colors.textTertiary}
            multiline
            style={[styles.input, { color: colors.text }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send comment"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={() => void send()}
            style={({ pressed }) => [
              styles.send,
              { backgroundColor: colors.actionPrimary },
              !canSend && styles.disabled,
              pressed && canSend && styles.pressed,
            ]}>
            <SymbolView
              name={{ ios: 'paperplane.fill', android: 'send' }}
              size={16}
              tintColor={colors.onActionPrimary}
              fallback={<View />}
            />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.s8,
  },
  bubble: {
    maxWidth: '90%',
    gap: Spacing.s4,
    padding: Spacing.s12,
    borderRadius: Radius.lg,
  },
  mineMeta: {
    textAlign: 'right',
    opacity: 0.8,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.s8,
    padding: Spacing.s8,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    paddingHorizontal: Spacing.s8,
    paddingVertical: Spacing.s8,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
