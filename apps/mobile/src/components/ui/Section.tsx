import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

const count = (n: number) => n.toLocaleString("en-GB");

// A section's heading, as on the web: the name, its count in muted type beside it, and on the right either
// a quiet "See all ›" or an action (a small pill such as + Add).
export function SectionHeading({ title, total, onSeeAll, seeAllLabel, action }: {
  title: string;
  total?: number;
  onSeeAll?: () => void;
  // Read out instead of "See all" (e.g. "See all 14 in Finished").
  seeAllLabel?: string;
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.heading}>
      <View style={styles.title} accessibilityRole="header">
        <Text variant="title">{title}</Text>
        {total !== undefined && <Text variant="muted">{count(total)}</Text>}
      </View>
      {action}
      {onSeeAll && (
        <Pressable accessibilityRole="link" accessibilityLabel={seeAllLabel ?? `See all ${title}`} onPress={onSeeAll} hitSlop={10} style={styles.seeAll}>
          <Text variant="muted">See all</Text>
          <ChevronRight size={16} color={colors.mutedForeground} />
        </Pressable>
      )}
    </View>
  );
}

// The hairline between a page's major sections (the web's border-t between profile blocks).
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, style]} />;
}

// A raised surface: the popover fill with the border, the web's card.
export function cardStyle(colors: { popover: string; border: string }, radius: number, pressed = false, pressedFill?: string): ViewStyle {
  return { backgroundColor: pressed && pressedFill ? pressedFill : colors.popover, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius };
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 34 },
  title: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 8 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
});
