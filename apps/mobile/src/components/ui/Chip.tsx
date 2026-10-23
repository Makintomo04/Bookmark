import { Pressable, StyleSheet, View, type PressableProps } from "react-native";
import { Check } from "lucide-react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

// A pill that toggles (genres, presets): filled with the brand when on, as on the web.
export function Chip({ label, selected, ...props }: Omit<PressableProps, "children"> & { label: string; selected: boolean }) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: selected ? colors.brandFill : colors.input, backgroundColor: selected ? colors.brandFill : pressed ? colors.muted : "transparent" },
        props.disabled && { opacity: 0.6 },
      ]}
      {...props}
    >
      <View style={styles.row}>
        {selected && <Check size={14} color={colors.onBrand} />}
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: selected ? colors.onBrand : colors.foreground }}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 36, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
});
