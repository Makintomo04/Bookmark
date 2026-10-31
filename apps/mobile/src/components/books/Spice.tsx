import { StyleSheet, View } from "react-native";
import { Flame } from "lucide-react-native";
import { SPICE_HINT, SPICE_LABEL, SPICE_LEVELS, SPICE_MAX, SPICE_MIN_REPORTS, type SpiceLevel, type SpiceSummary } from "@bookmark/shared/workTags";
import { Chip } from "@/components/ui/Chip";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// Spice, as the web's components/books/WorkTags.tsx shows and asks for it: readers' median once
// SPICE_MIN_REPORTS have reported one, and a 0 to 5 picker for a reader who finished the book.

// Five flames, `level` of them lit. Decorative: the words beside it say the level.
export function SpiceFlames({ level, size = 14 }: { level: SpiceLevel; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.flames} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: SPICE_MAX }, (_, i) => (
        <Flame key={i} size={size} color={i < level ? colors.foreground : colors.input} fill={i < level ? colors.foreground : "transparent"} />
      ))}
    </View>
  );
}

export function SpiceLine({ spice }: { spice: SpiceSummary | undefined }) {
  const { colors } = useTheme();
  if (!spice || spice.reports === 0) return null;
  if (spice.level === null && spice.early !== null) {
    return (
      <View style={styles.row} accessible accessibilityLabel={`Early spice reading: ${spice.early} of ${SPICE_MAX}, ${SPICE_LABEL[spice.early]}, from ${spice.reports} readers`}>
        <SpiceFlames level={spice.early} size={16} />
        <Text variant="muted" style={{ flex: 1 }}>
          <Text variant="label">Early: spice {spice.early} of {SPICE_MAX}</Text> · {SPICE_LABEL[spice.early]}, from {spice.reports} readers
        </Text>
      </View>
    );
  }
  if (spice.level === null) {
    return (
      <View style={styles.row}>
        <Flame size={16} color={colors.mutedForeground} />
        <Text variant="muted" style={{ flex: 1 }}>Spice shows once {SPICE_MIN_REPORTS} readers have reported it</Text>
      </View>
    );
  }
  return (
    <View style={styles.row} accessible accessibilityLabel={`Spice ${spice.level} of ${SPICE_MAX}, ${SPICE_LABEL[spice.level]}`}>
      <SpiceFlames level={spice.level} size={16} />
      <Text variant="muted" style={{ flex: 1 }}>
        <Text variant="label">Spice {spice.level} of {SPICE_MAX}</Text> · {SPICE_LABEL[spice.level]}
      </Text>
    </View>
  );
}

export function SpicePicker({ value, onChange, disabled }: { value: SpiceLevel | null; onChange: (next: SpiceLevel | null) => void; disabled?: boolean }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label">How spicy was it? <Text variant="muted">· optional</Text></Text>
      <Text variant="small">A book shows the middle answer once {SPICE_MIN_REPORTS} readers have given one. Tap your answer again to clear it.</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Spice level">
        {SPICE_LEVELS.map((n) => (
          <Chip
            key={n}
            label={`${n} ${SPICE_LABEL[n]}`}
            selected={value === n}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === n, disabled }}
            accessibilityLabel={`${n}, ${SPICE_LABEL[n]}: ${SPICE_HINT[n]}`}
            onPress={() => onChange(value === n ? null : n)}
          />
        ))}
      </View>
      {value !== null && <Text variant="small" accessibilityLiveRegion="polite">{SPICE_HINT[value]}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  flames: { flexDirection: "row", gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
