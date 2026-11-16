import { Pressable, StyleSheet, View, type PressableProps } from "react-native";
import { Check } from "lucide-react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

// A pill that toggles (genres, presets): the light fill with a check when on. Red stays for the one action a
// screen is for, so a wall of picked genres doesn't turn the page red.
export function Chip({ label, selected, ...props }: Omit<PressableProps, "children"> & { label: string; selected: boolean }) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: selected ? colors.foreground : colors.input, backgroundColor: selected ? colors.foreground : pressed ? colors.muted : "transparent" },
        props.disabled && { opacity: 0.6 },
      ]}
      {...props}
    >
      <View style={styles.row}>
        {selected && <Check size={14} color={colors.background} />}
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: selected ? colors.background : colors.foreground }}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 36, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
});
