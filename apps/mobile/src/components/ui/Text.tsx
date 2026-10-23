import { Text as RNText, type TextProps } from "react-native";
import { useTheme } from "@/lib/theme";

// The type scale, after the web's: `display` is the page title (Literata, like .page-title), `hero` the
// one big moment on a screen (like .display-hero), and the rest Inter.
type Variant = "hero" | "display" | "title" | "body" | "label" | "muted" | "small";

const sizes: Record<Variant, { fontSize: number; lineHeight: number }> = {
  hero: { fontSize: 40, lineHeight: 44 },
  display: { fontSize: 30, lineHeight: 36 },
  title: { fontSize: 18, lineHeight: 24 },
  body: { fontSize: 16, lineHeight: 22 },
  label: { fontSize: 14, lineHeight: 20 },
  muted: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
};

export function Text({ variant = "body", style, ...props }: TextProps & { variant?: Variant }) {
  const { colors, fonts } = useTheme();
  const fontFamily =
    variant === "hero" || variant === "display" ? fonts.display
    : variant === "title" || variant === "label" ? fonts.sansSemibold
    : fonts.sans;
  const color = variant === "muted" || variant === "small" ? colors.mutedForeground : colors.foreground;
  const tracking = variant === "hero" ? -0.8 : variant === "display" ? -0.45 : 0;
  return <RNText {...props} style={[{ fontFamily, color, letterSpacing: tracking, ...sizes[variant] }, style]} />;
}
