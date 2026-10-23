import { StyleSheet, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

// Marks every piece of text the model wrote. The rule from the strategy: AI is always labelled.
export function AiLabel() {
  const { colors } = useTheme();
  return (
    <View style={[styles.label, { backgroundColor: colors.muted }]} accessibilityLabel="Written by AI">
      <Sparkles size={10} color={colors.brand} />
      <Text style={{ fontSize: 10, color: colors.brandText, letterSpacing: 0.5 }}>AI</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start" },
});
