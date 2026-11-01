import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from "react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

// `primary` is the brand fill with white text (the one red buttons use), `outline` sits beside it for
// the other ways to do something, `ghost` is a text link.
type Variant = "primary" | "outline" | "ghost";

interface ButtonProps extends Omit<PressableProps, "children"> {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ title, variant = "primary", loading = false, disabled, icon, style, ...props }: ButtonProps) {
  const { colors, radii, fonts } = useTheme();
  const inactive = disabled || loading;
  const textColor = variant === "primary" ? colors.onBrand : variant === "ghost" ? colors.brandText : colors.foreground;

  return (
    <Pressable
      accessibilityRole="button"
      // Android builds the description from the label and "busy". With no label, React Native never clears
      // "busy" once loading ends, so TalkBack and the accessibility tree say "busy" for good. A caller's
      // own label (in props) still wins.
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      style={(state) => [
        styles.base,
        { borderRadius: radii.md },
        variant === "primary" && { backgroundColor: state.pressed ? colors.brandFillPressed : colors.brandFill },
        variant === "outline" && { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.input, backgroundColor: state.pressed ? colors.muted : "transparent" },
        variant === "ghost" && { minHeight: 36, paddingHorizontal: 4 },
        inactive && { opacity: 0.6 },
        typeof style === "function" ? style(state) : style,
      ]}
      {...props}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={textColor} /> : icon}
        <Text style={{ color: textColor, fontFamily: fonts.sansSemibold, fontSize: 16 }}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
