import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import useSWR from "swr";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { ArrowRight, EyeOff } from "lucide-react-native";
import { PAGES_SANITY_MAX, questCountdown, questDates, questDay, type QuestGoal, type QuestMedalDesign, type QuestPhase } from "@bookmark/shared/questRules";
import { QuestMedal } from "@/components/achievements/Medal";
import { BookCover } from "@/components/books/BookCover";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// One quest (the web's /quests/<slug>): the medal, the goal, your progress and the books counted so
// far, and how counting works.

type CountedBook = { bookId: string; title: string; author: string; coverImage: string; cardColour: string | null; finishedAt: string };
type QuestDetail = {
  quest: { id: string; slug: string; title: string; description: string; startsAt: string; endsAt: string; hidden: boolean };
  goal: QuestGoal | null;
  goalText: string;
  phase: QuestPhase;
  design: QuestMedalDesign;
  standing: { count: number; target: number; books: CountedBook[] } | null;
  earnedAt: string | null;
  earnedCount: number;
};

export default function QuestScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const { data, error, isLoading } = useSWR<QuestDetail>(`/api/quests/${encodeURIComponent(slug)}`);

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (error || !data) {
    return (
      <Screen edges={["left", "right"]}>
        <Text variant="display">Quest not found</Text>
        <Text variant="muted">It may have been taken down, or the link is wrong.</Text>
      </Screen>
    );
  }

  const { quest, goal, phase, design, standing, earnedAt, earnedCount } = data;
  const readers = `${earnedCount.toLocaleString("en-GB")} ${earnedCount === 1 ? "reader" : "readers"}`;
  const percent = standing ? Math.min(100, Math.round((standing.count / standing.target) * 100)) : 0;

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen options={{ title: "" }} />
      <View style={styles.header}>
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="questBg" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={design.ribbon} />
              <Stop offset="1" stopColor={design.colour} />
            </LinearGradient>
            <RadialGradient id="questGlow" cx="0.9" cy="0.1" r="0.55">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.16} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100" height="100" fill="url(#questBg)" />
          <Rect width="100" height="100" fill="url(#questGlow)" />
        </Svg>
        <QuestMedal design={design} earned width={104} />
        <Text style={styles.kicker}>SEASONAL QUEST · {questDates(quest.startsAt, quest.endsAt).toUpperCase()}</Text>
        <Text variant="display" style={{ color: "#ffffff" }}>{quest.title}</Text>
        <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 16, lineHeight: 23 }}>{quest.description}</Text>
        <Text variant="label" style={{ color: "#ffffff" }}>
          {phase === "ended" ? `Ended: ${readers} earned this` : phase === "upcoming" ? questCountdown(quest) : `${questCountdown(quest)} · ${readers} earned it so far`}
        </Text>
      </View>

      {quest.hidden && (
        <View style={[styles.draft, { backgroundColor: colors.muted }]}>
          <EyeOff size={14} color={colors.mutedForeground} />
          <Text variant="muted" style={{ flex: 1 }}>Draft: only the Bookmark team can see this quest, and nobody can earn it yet.</Text>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Text variant="title" accessibilityRole="header">The goal</Text>
        <Text style={{ fontSize: 18, lineHeight: 25 }}>{data.goalText || "This quest has no goal set."}</Text>
        {goal?.type === "list" && (
          <Pressable accessibilityRole="link" onPress={() => router.push(`/lists/${goal.listId}`)} style={styles.link}>
            <Text variant="label">See the list</Text>
            <ArrowRight size={14} color={colors.foreground} />
          </Pressable>
        )}
      </View>

      {standing && (
        <View style={{ gap: 10 }}>
          {earnedAt ? (
            <Text variant="label">You earned this medal on {questDay(earnedAt)}. It stays on your profile for good.</Text>
          ) : phase === "upcoming" ? (
            <Text variant="muted">Starts {questDay(quest.startsAt)}. Books you finish from then on count.</Text>
          ) : (
            <>
              <View style={styles.row}>
                <Text variant="label">{phase === "ended" ? "Where you finished" : "Your progress"}</Text>
                <Text variant="muted">{standing.count} / {standing.target} books</Text>
              </View>
              <View
                accessibilityRole="progressbar"
                accessibilityLabel="Your progress"
                accessibilityValue={{ min: 0, max: standing.target, now: standing.count }}
                style={[styles.track, { backgroundColor: colors.border }]}
              >
                <View style={[styles.track, { width: `${percent}%`, backgroundColor: design.colour }]} />
              </View>
            </>
          )}
          {standing.books.length > 0 && (
            <View style={{ gap: 12, marginTop: 8 }}>
              <Text variant="label">Counted so far</Text>
              {standing.books.map((b) => (
                <View key={b.bookId} style={styles.book}>
                  <BookCover book={b} width={36} />
                  <View style={{ flex: 1 }}>
                    <Text variant="label" numberOfLines={1}>{b.title}</Text>
                    <Text variant="small" numberOfLines={1}>{b.author} · finished {questDay(b.finishedAt)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={[styles.aside, { borderColor: colors.border }]}>
        <Text variant="label">How it counts</Text>
        {[
          `Only books you finish between ${questDay(quest.startsAt)} and ${questDay(quest.endsAt)} (UTC) count. You're in automatically.`,
          "Each book counts once, re-reads included.",
          goal?.type === "startedInWindow" && "The book has to be started during the quest too, so books added straight to Finished don't count.",
          goal?.type === "pages" && `Page counts come from Open Library when the book is linked to it, and books over ${PAGES_SANITY_MAX.toLocaleString("en-GB")} pages are left out.`,
          goal?.type === "genre" && "Goes by the genre on your shelf copy of the book.",
          "Imported books count only when their own read date falls inside the quest.",
          "Earn it and the medal stays on your profile after the quest ends.",
        ].filter(Boolean).map((line) => (
          <View key={line as string} style={{ flexDirection: "row", gap: 8 }}>
            <Text variant="muted">•</Text>
            <Text variant="muted" style={{ flex: 1 }}>{line}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { borderRadius: 20, padding: 22, gap: 12, overflow: "hidden" },
  kicker: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "600", letterSpacing: 1.5 },
  draft: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 12 },
  link: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  book: { flexDirection: "row", alignItems: "center", gap: 12 },
  aside: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
});
