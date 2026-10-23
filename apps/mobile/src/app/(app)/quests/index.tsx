import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import { EyeOff } from "lucide-react-native";
import { questCountdown, questDates, questPhase, type QuestMedalDesign } from "@bookmark/shared/questRules";
import { MEDAL_INK, QuestMedal } from "@/components/achievements/Medal";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// Quests (the web's /quests): seasonal challenges, on now, coming up and past. Setting quests stays a
// Bookmark team job on the web.

type QuestSummary = {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string;
  hidden: boolean;
  goalText: string;
  design: QuestMedalDesign;
  earnedCount: number;
  earned: boolean;
};
type QuestList = { live: QuestSummary[]; upcoming: QuestSummary[]; ended: QuestSummary[] };

export default function Quests() {
  const { colors } = useTheme();
  const { data, error, isLoading } = useSWR<QuestList>("/api/quests");

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (error || !data) return <Screen><Notice tone="error" message="We couldn't load the quests. Try again in a moment." /></Screen>;

  const section = (heading: string, quests: QuestSummary[], empty?: string) => (quests.length > 0 || empty) && (
    <View style={{ gap: 10 }}>
      <Text variant="title" accessibilityRole="header">{heading}</Text>
      {quests.length === 0 ? <Text variant="muted">{empty}</Text> : quests.map((q) => <QuestCard key={q.id} quest={q} />)}
    </View>
  );

  return (
    <Screen edges={["left", "right"]}>
      <View style={{ gap: 6 }}>
        <Text variant="display">Quests</Text>
        <Text variant="muted">
          Seasonal reading challenges from the Bookmark team. Finish one before it ends to earn a limited-edition medal, yours for good.
          There's nothing to join: every book you finish during a quest counts.
        </Text>
      </View>
      {section("On now", data.live, "No quest is running right now. The next one is never far off.")}
      {section("Coming up", data.upcoming)}
      {section("Past quests", data.ended)}
    </Screen>
  );
}

function QuestCard({ quest }: { quest: QuestSummary }) {
  const { colors } = useTheme();
  const phase = questPhase(quest);
  const n = quest.earnedCount;
  const footer = phase === "ended"
    ? `Ended: ${n.toLocaleString("en-GB")} ${n === 1 ? "reader" : "readers"} earned this`
    : phase === "live" && n > 0
      ? `${questCountdown(quest)} · ${n.toLocaleString("en-GB")} earned so far`
      : questCountdown(quest);

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/quests/${quest.slug}` as never)}
      style={({ pressed }) => [styles.card, { borderColor: colors.border, backgroundColor: pressed ? colors.muted : "transparent" }]}
    >
      <QuestMedal design={quest.design} earned={phase !== "ended" || quest.earned} width={60} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.titleRow}>
          <Text variant="label" numberOfLines={1} style={{ flexShrink: 1, fontSize: 16 }}>{quest.title}</Text>
          {quest.hidden && (
            <View style={[styles.tag, { backgroundColor: colors.muted }]}>
              <EyeOff size={11} color={colors.mutedForeground} />
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Draft</Text>
            </View>
          )}
          {quest.earned && (
            <View style={[styles.tag, { backgroundColor: quest.design.colour }]}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: MEDAL_INK }}>Earned</Text>
            </View>
          )}
        </View>
        <Text variant="muted" numberOfLines={2}>{quest.goalText}</Text>
        <Text variant="small">{questDates(quest.startsAt, quest.endsAt)} · {footer}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 16, padding: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
