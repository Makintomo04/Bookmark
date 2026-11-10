import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from "react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

// The web's button variants. `primary` is the brand fill with white text, kept for the one action a screen
// is for (sign in, save); `inverse` is the light fill the web gives a page's main action that isn't a
// commitment (Start a reading circle, Follow, Join); `secondary` the quiet muted fill (Show more); `outline`
// sits beside the others; `ghost` is a text link.
type Variant = "primary" | "inverse" | "secondary" | "outline" | "ghost";

interface ButtonProps extends Omit<PressableProps, "children"> {
  title: string;
  variant?: Variant;
  // `sm` is the compact pill for actions beside a heading or in a row (+ Add, Follow); it keeps a 44pt target.
  size?: "md" | "sm";
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ title, variant = "primary", size = "md", loading = false, disabled, icon, style, ...props }: ButtonProps) {
  const { colors, radii, fonts } = useTheme();
  const inactive = disabled || loading;
  const textColor =
    variant === "primary" ? colors.onBrand
    : variant === "inverse" ? colors.background
    : variant === "ghost" ? colors.brandText
    : colors.foreground;
  const small = size === "sm";

  return (
    <Pressable
      accessibilityRole="button"
      // Android builds the description from the label and "busy". With no label, React Native never clears
      // "busy" once loading ends, so TalkBack and the accessibility tree say "busy" for good. A caller's
      // own label (in props) still wins.
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      hitSlop={small ? 6 : undefined}
      style={(state) => [
        styles.base,
        small ? styles.small : { borderRadius: radii.md },
        variant === "primary" && { backgroundColor: state.pressed ? colors.brandFillPressed : colors.brandFill },
        variant === "inverse" && { backgroundColor: colors.foreground, opacity: state.pressed ? 0.85 : 1 },
        variant === "secondary" && { backgroundColor: state.pressed ? colors.border : colors.muted },
        variant === "outline" && { borderWidth: 1, borderColor: colors.input, backgroundColor: state.pressed ? colors.muted : "transparent" },
        variant === "ghost" && { minHeight: 36, paddingHorizontal: 4 },
        inactive && { opacity: 0.6 },
        typeof style === "function" ? style(state) : style,
      ]}
      {...props}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={textColor} /> : icon}
        <Text style={{ color: textColor, fontFamily: fonts.sansMedium, fontSize: small ? 14 : 15, lineHeight: small ? 20 : 20 }}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 44, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  small: { minHeight: 34, paddingHorizontal: 14, borderRadius: 999 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
});
