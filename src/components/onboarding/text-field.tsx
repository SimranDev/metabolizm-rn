import { type ComponentProps } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
} & Pick<
  ComponentProps<typeof TextInput>,
  'placeholder' | 'secureTextEntry' | 'keyboardType' | 'autoCapitalize' | 'autoComplete' | 'textContentType'
>;

/** Labeled text input used on the auth screens. */
export function TextField({ label, value, onChangeText, ...rest }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.box}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
          {...rest}
        />
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  box: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    height: 52,
    justifyContent: 'center',
  },
  input: {
    fontFamily: Fonts.sans,
    fontSize: 16,
  },
});
