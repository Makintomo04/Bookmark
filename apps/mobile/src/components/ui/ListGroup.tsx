import { Children, Fragment, type ComponentType, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useTheme } from "@/lib/theme";
import { cardStyle } from "./Section";
import { Text } from "./Text";

// A titled group of rows on one card, divided by hairlines: the settings-style list the More tab is made of,
// in place of a stack of full-width buttons.
export function ListGroup({ label, children }: { label?: string; children: ReactNode }) {
  const { colors, radii } = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: 8 }}>
      {label && <Text variant="muted" accessibilityRole="header" style={{ paddingHorizontal: 4 }}>{label}</Text>}
      <View style={[cardStyle(colors, radii.lg), { overflow: "hidden" }]}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 48 }} />}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

// One row: a muted line icon, the label, an optional value or badge on the right, and a chevron when it
// goes somewhere. `danger` is for Sign out.
export function ListRow({ icon: Icon, label, value, badge, onPress, tone, chevron = true, accessibilityHint }: {
  icon?: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  value?: string;
  badge?: ReactNode;
  onPress: () => void;
  tone?: "danger";
  chevron?: boolean;
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  const ink = tone === "danger" ? colors.danger : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.muted }]}
    >
      {Icon && <Icon size={20} strokeWidth={1.75} color={tone === "danger" ? colors.danger : colors.mutedForeground} />}
      <Text style={{ flex: 1, color: ink, fontSize: 15, lineHeight: 20, paddingVertical: 14 }} numberOfLines={2}>{label}</Text>
      {badge}
      {value !== undefined && <Text variant="muted">{value}</Text>}
      {chevron && <ChevronRight size={16} color={colors.mutedForeground} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 52, paddingHorizontal: 14 },
});
