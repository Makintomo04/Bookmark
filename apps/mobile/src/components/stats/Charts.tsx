import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// The stats charts (the web's components/stats/Charts.tsx) as plain bars, in the reader's colour.
// Each bar carries its own spoken label, so the numbers don't depend on seeing the chart.

export type Datum = { label: string; short?: string; value: number; detail: string; name?: string };

// Columns over time or a scale: months, years, star ratings.
export function ColumnChart({ data, accent, label }: { data: Datum[]; accent: string; label: string }) {
  const { colors } = useTheme();
  const peak = Math.max(1, ...data.map((d) => d.value));
  return (
    <View accessibilityLabel={label} style={styles.columns}>
      {data.map((d) => (
        <View key={d.label} style={styles.column} accessible accessibilityLabel={`${d.name ?? d.label}: ${d.detail}`}>
          <View style={styles.track}>
            <View style={[styles.bar, { height: `${(d.value / peak) * 100}%`, backgroundColor: d.value ? accent : colors.muted, minHeight: d.value ? 3 : 1 }]} />
          </View>
          <Text style={{ fontSize: 10, color: colors.mutedForeground }} numberOfLines={1}>{data.length > 8 ? d.short ?? d.label : d.label}</Text>
        </View>
      ))}
    </View>
  );
}

// A ranking: top genres, top authors.
export function RankedBars({ data, accent, label }: { data: Datum[]; accent: string; label: string }) {
  const { colors } = useTheme();
  const peak = Math.max(1, ...data.map((d) => d.value));
  return (
    <View accessibilityLabel={label} style={{ gap: 10 }}>
      {data.map((d) => (
        <View key={d.label} style={{ gap: 4 }} accessible accessibilityLabel={`${d.label}: ${d.detail}`}>
          <View style={styles.rankLine}>
            <Text numberOfLines={1} style={{ flex: 1 }}>{d.label}</Text>
            <Text variant="small">{d.detail}</Text>
          </View>
          <View style={[styles.rankTrack, { backgroundColor: colors.muted }]}>
            <View style={[styles.rankBar, { width: `${(d.value / peak) * 100}%`, backgroundColor: accent }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 140 },
  column: { flex: 1, alignItems: "center", gap: 4, height: "100%" },
  track: { flex: 1, width: "100%", maxWidth: 40, justifyContent: "flex-end" },
  bar: { width: "100%", borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  rankLine: { flexDirection: "row", gap: 8, alignItems: "baseline" },
  rankTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  rankBar: { height: 6, borderRadius: 3 },
});
