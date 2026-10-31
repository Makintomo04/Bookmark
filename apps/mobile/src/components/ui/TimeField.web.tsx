import { Pressable, StyleSheet, View } from "react-native";
import { clockLabel, formatMinute, parseMinute, REMINDER_STEP } from "@bookmark/shared/reminders";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

// The web build (development only) has no native time picker: earlier and later buttons step through
// the allowed quarter hours instead.
const QUARTERS = Array.from({ length: (24 * 60) / REMINDER_STEP }, (_, i) => i * REMINDER_STEP);

export function TimeField({ label, value, onChange, options = QUARTERS, disabled }: { label: string; value: string; onChange: (value: string) => void; options?: number[]; disabled?: boolean }) {
  const { colors } = useTheme();
  const at = Math.max(0, options.indexOf(parseMinute(value) ?? 0));
  const step = (by: number) => !disabled && options.length && onChange(formatMinute(options[(at + by + options.length) % options.length]));
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} earlier`} onPress={() => step(-1)} hitSlop={8}><Text style={{ color: colors.brandText }}>‹</Text></Pressable>
      <Text>{clockLabel(parseMinute(value) ?? 0)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} later`} onPress={() => step(1)} hitSlop={8}><Text style={{ color: colors.brandText }}>›</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
