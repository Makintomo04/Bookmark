import { forwardRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from "react-native";
import { Check, Eye, EyeOff } from "lucide-react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

interface TextFieldProps extends TextInputProps {
  label: string;
  // A muted part of the label after a dot, like "optional".
  labelNote?: string;
  error?: string | null;
  // The line under the field when there's no error; `good` marks it as a pass (a free username).
  hint?: string | null;
  hintTone?: "muted" | "good" | "danger";
  // Fixed text inside the field before what's typed (the @ before a username).
  prefix?: string;
}

// The web widget's emerald (600 on light, 400 on dark), for a check that passed.
const GOOD = { dark: "#34d399", light: "#059669" } as const;

// A labelled input. Control edges use the `input` token (3:1 against the page); the focus edge is the
// neutral ring, never red, and errors are the danger colour with the message under the field. A password
// (secureTextEntry) gets the eye that shows it, as on the web.
export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField({ label, labelNote, error, hint, hintTone = "muted", prefix, style, onFocus, onBlur, secureTextEntry, ...props }, ref) {
  const { colors, radii, fonts, scheme } = useTheme();
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  const secret = !!secureTextEntry;
  // A caller's shorter field (the goal's "Other", beside 36pt chips) sets the edge's height too.
  const minHeight = (StyleSheet.flatten(style)?.minHeight as number | undefined) ?? 48;
  const hintColour = hintTone === "good" ? GOOD[scheme] : hintTone === "danger" ? colors.danger : colors.mutedForeground;
  return (
    <View style={styles.wrap}>
      <Text variant="label">
        {label}
        {labelNote ? <Text variant="muted" style={{ fontSize: 14 }}> · {labelNote}</Text> : null}
      </Text>
      <View
        style={[
          styles.box,
          {
            borderRadius: radii.md,
            minHeight: Math.min(48, minHeight),
            borderColor: error ? colors.danger : focused ? colors.ring : colors.input,
            backgroundColor: colors.background,
          },
        ]}
      >
        {prefix ? <Text variant="muted" style={{ fontSize: 16, marginRight: 2 }}>{prefix}</Text> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry={secret && !shown}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={[
            styles.input,
            {
              color: colors.foreground,
              fontFamily: fonts.sans,
              // The web build: the border above is the focus edge, not the browser's own outline.
              outlineWidth: 0,
            },
            style,
          ]}
          {...props}
        />
        {secret && (
          <Pressable accessibilityRole="button" accessibilityLabel={shown ? "Hide password" : "Show password"} hitSlop={10} onPress={() => setShown((s) => !s)} style={styles.eye}>
            {shown ? <EyeOff size={18} color={colors.mutedForeground} /> : <Eye size={18} color={colors.mutedForeground} />}
          </Pressable>
        )}
      </View>
      {error ? (
        <Text variant="small" style={{ color: colors.danger }}>{error}</Text>
      ) : hint ? (
        <View style={styles.hint}>
          {hintTone === "good" && <Check size={12} color={hintColour} />}
          <Text variant="small" style={{ color: hintColour, flexShrink: 1 }}>{hint}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  box: { flexDirection: "row", alignItems: "center", minHeight: 48, borderWidth: 1, paddingHorizontal: 12 },
  input: { flex: 1, alignSelf: "stretch", fontSize: 16, paddingHorizontal: 0 },
  eye: { paddingLeft: 10, alignSelf: "stretch", justifyContent: "center" },
  hint: { flexDirection: "row", alignItems: "center", gap: 4 },
});
