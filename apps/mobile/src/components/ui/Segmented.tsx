import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

// One choice from a few (the web's settings Segmented control).
export function Segmented<T extends string>({ options, value, onChange, disabled, label }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  label?: string;
}) {
  const { colors, radii, fonts } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {label && <Text variant="label">{label}</Text>}
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.track, { borderRadius: radii.md, backgroundColor: colors.muted }]}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              style={[styles.segment, { borderRadius: radii.sm }, selected && { backgroundColor: colors.background }]}
            >
              <Text style={{ fontFamily: selected ? fonts.sansSemibold : fonts.sans, fontSize: 14, color: selected ? colors.foreground : colors.mutedForeground, textAlign: "center" }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
});
