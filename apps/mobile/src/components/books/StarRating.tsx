import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { brand } from "@bookmark/shared/tokens";
import { useTheme } from "@/lib/theme";

// Half-star ratings from 0.5 to 5, as on the web. Tapping a star gives it whole; tapping the same star
// again makes it a half; tapping the half clears it. Stars are the brand mark colour.
const STAR = "M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6z";

function Star({ fill, size, empty }: { fill: 0 | 0.5 | 1; size: number; empty: string }) {
  const id = `half${size}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          <Stop offset="0.5" stopColor={brand.DEFAULT} />
          <Stop offset="0.5" stopColor={empty} />
        </LinearGradient>
      </Defs>
      <Path d={STAR} fill={fill === 1 ? brand.DEFAULT : fill === 0.5 ? `url(#${id})` : empty} />
    </Svg>
  );
}

export function StarRating({ value, onChange, size = 32, disabled, label = "Rating" }: { value: number; onChange?: (value: number) => void; size?: number; disabled?: boolean; label?: string }) {
  const { colors } = useTheme();
  const stars = [1, 2, 3, 4, 5];
  const press = (n: number) => {
    if (!onChange) return;
    if (value === n) onChange(n - 0.5);
    else if (value === n - 0.5) onChange(0);
    else onChange(n);
  };
  return (
    <View
      accessible={!onChange}
      accessibilityRole={onChange ? "adjustable" : "text"}
      accessibilityLabel={`${label}: ${value ? `${value} out of 5` : "none"}`}
      accessibilityActions={onChange ? [{ name: "increment" }, { name: "decrement" }] : undefined}
      onAccessibilityAction={(e) => onChange?.(Math.max(0, Math.min(5, value + (e.nativeEvent.actionName === "increment" ? 0.5 : -0.5))))}
      style={styles.row}
    >
      {stars.map((n) => {
        const fill: 0 | 0.5 | 1 = value >= n ? 1 : value >= n - 0.5 ? 0.5 : 0;
        return onChange ? (
          <Pressable key={n} onPress={() => press(n)} disabled={disabled} hitSlop={4} importantForAccessibility="no">
            <Star fill={fill} size={size} empty={colors.muted} />
          </Pressable>
        ) : (
          <Star key={n} fill={fill} size={size} empty={colors.muted} />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 4 },
});
