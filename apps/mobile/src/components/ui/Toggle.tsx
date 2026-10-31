import { StyleSheet, Switch, View } from "react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

// A setting that's on or off, with what it does underneath. Settings and the reminders sheet.
export function Toggle({ label, hint, value, onChange, disabled }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{label}</Text>
        <Text variant="small">{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: colors.foreground, false: colors.input }}
        thumbColor={colors.background}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: "row", alignItems: "center", gap: 16 },
});
