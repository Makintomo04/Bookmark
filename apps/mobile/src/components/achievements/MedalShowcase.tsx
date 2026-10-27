import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { topMedals } from "@bookmark/shared/medals";
import { Medal } from "@/components/achievements/Medal";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// A reader's best three medals under their profile header, picked as the web's are (topMedals).
// Nothing until they've earned one. Pressing it opens their achievements.
export function MedalShowcase({ earned, onPress }: { earned: { key: string }[]; onPress: () => void }) {
  const { colors } = useTheme();
  const medals = topMedals(earned);
  if (medals.length === 0) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Top medals: ${medals.map((m) => `${m.title}, ${m.achievement}`).join("; ")}. See all achievements`}
      onPress={onPress}
      style={{ gap: 8 }}
    >
      <View style={styles.heading}>
        <Text variant="small" style={{ fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>Top medals</Text>
        <View style={styles.seeAll}>
          <Text variant="small">See all</Text>
          <ChevronRight size={14} color={colors.mutedForeground} />
        </View>
      </View>
      <View style={styles.row}>
        {medals.map((m) => (
          <View key={m.key} style={[styles.card, { borderColor: colors.border }]}>
            <Medal achievementKey={m.key} earned size={40} />
            <Text variant="label" numberOfLines={1} style={{ textAlign: "center" }}>{m.title}</Text>
            <Text variant="small" numberOfLines={1} style={{ textAlign: "center" }}>{m.achievement}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  row: { flexDirection: "row", gap: 8 },
  card: { flex: 1, alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 12, padding: 10 },
});
