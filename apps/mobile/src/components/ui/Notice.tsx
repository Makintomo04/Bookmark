import { StyleSheet, View } from "react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

// An inline message: `error` for something that went wrong (plain words, danger colour), `info` for a
// neutral status like "Check your inbox".
export function Notice({ tone = "info", message }: { tone?: "error" | "info"; message: string }) {
  const { colors, radii } = useTheme();
  const isError = tone === "error";
  return (
    <View
      accessibilityRole={isError ? "alert" : "text"}
      accessibilityLiveRegion="polite"
      style={[styles.box, { borderRadius: radii.md, backgroundColor: colors.muted, borderLeftColor: isError ? colors.danger : colors.ring }]}
    >
      <Text style={{ color: isError ? colors.danger : colors.foreground, fontSize: 14, lineHeight: 20 }}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingHorizontal: 12, paddingVertical: 10, borderLeftWidth: 3 },
});
