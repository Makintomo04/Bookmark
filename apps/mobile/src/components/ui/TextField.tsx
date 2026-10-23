import { forwardRef, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from "react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
}

// A labelled input. Control edges use the `input` token (3:1 against the page); the focus edge is the
// neutral ring, never red, and errors are the danger colour with the message under the field.
export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField({ label, error, style, onFocus, onBlur, ...props }, ref) {
  const { colors, radii, fonts } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text variant="label">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.mutedForeground}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[
          styles.input,
          {
            borderRadius: radii.md,
            borderColor: error ? colors.danger : focused ? colors.ring : colors.input,
            color: colors.foreground,
            fontFamily: fonts.sans,
            backgroundColor: colors.background,
            // The web build: the border above is the focus edge, not the browser's own outline.
            outlineWidth: 0,
          },
          style,
        ]}
        {...props}
      />
      {error ? <Text variant="small" style={{ color: colors.danger }}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: { minHeight: 48, borderWidth: 1, paddingHorizontal: 12, fontSize: 16 },
});
