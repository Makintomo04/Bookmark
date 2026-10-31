import { useState } from "react";
import { StyleSheet, View } from "react-native";
import useSWR, { mutate } from "swr";
import { GOAL_BOOKS_MAX, expectedBooks, goalPace, streakText, type GoalProgress, type PaceTone } from "@bookmark/shared/goals";
import { Chip } from "@/components/ui/Chip";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useRemindersPrompt } from "@/lib/earnMoment";
import type { AskReason } from "@bookmark/shared/reminders";

// This year's reading goal: progress against it and whether that's on pace, or a quick way to set one (the
// web's ReadingGoalWidget, book count only; page and monthly goals are Plus and come with settings).
const PRESETS = [12, 24, 52];
// The web widget's emerald and amber (600 on light, 400 on dark): green ahead, amber behind, never red.
const PACE_COLOURS: Record<"dark" | "light", Record<Exclude<PaceTone, "neutral">, string>> = {
  dark: { good: "#34d399", behind: "#fbbf24" },
  light: { good: "#059669", behind: "#d97706" },
};

export function GoalCard({ accent }: { accent: string }) {
  const { colors, radii, scheme } = useTheme();
  const year = new Date().getFullYear();
  // The goal and its progress in one request, as the web widget loads them; the pace needs both.
  const { data, isLoading } = useSWR<{ goal: { targetBooks: number; createdAt?: string } | null; progress: GoalProgress & { beforeGoal?: number } }>(`/api/reading-goal/summary?year=${year}`);
  const goal = data?.goal;
  const progress = data?.progress;
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (isLoading) return null;

  const set = async (targetBooks: number) => {
    if (targetBooks < 1 || targetBooks > GOAL_BOOKS_MAX) return;
    setSaving(targetBooks);
    setError(null);
    try {
      const saved = await api.post<{ askReminders?: AskReason | false }>("/api/reading-goal", { year, targetBooks });
      // Setting a goal is one of the moments reminders are offered, once.
      if (saved?.askReminders) useRemindersPrompt.setState({ asked: saved.askReminders });
      await mutate((key) => typeof key === "string" && key.startsWith("/api/reading-goal"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your goal. Try again.");
    } finally {
      setSaving(null);
    }
  };

  const box = [styles.box, { borderRadius: radii.lg, borderColor: colors.border }];
  // Their streak, so "ends tonight" is in sight before the evening alert (BOO-48).
  const streak = streakText(progress?.streak);
  if (!goal) {
    return (
      <View style={box}>
        <Text variant="title">Set a {year} reading goal</Text>
        <Text variant="muted">How many books this year?</Text>
        <View style={styles.chips}>
          {PRESETS.map((n) => <Chip key={n} label={saving === n ? "…" : String(n)} selected={false} disabled={saving !== null} onPress={() => set(n)} />)}
        </View>
        {error && <Text variant="small" style={{ color: colors.danger }}>{error}</Text>}
        {streak && <Text variant="muted">{streak}</Text>}
      </View>
    );
  }

  const done = progress?.books ?? 0;
  const percent = Math.min(100, Math.round((done / goal.targetBooks) * 100));
  // The same words the web widget uses: "2 ahead of pace · 9 to go", "On pace", "Goal reached".
  const pace = goalPace(done, goal.targetBooks, expectedBooks(year, goal.targetBooks, goal.createdAt, progress?.beforeGoal));
  const paceColour = { ...PACE_COLOURS[scheme], neutral: colors.mutedForeground };
  return (
    <View style={box} accessible accessibilityLabel={`${year} reading goal: ${done} of ${goal.targetBooks} books`}>
      <View style={styles.line}>
        <Text variant="title">{year} goal</Text>
        <Text variant="muted">{done.toLocaleString("en-GB")} of {goal.targetBooks.toLocaleString("en-GB")} books</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.muted }]}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: accent }]} />
      </View>
      <Text variant="small" style={{ color: paceColour[pace.tone] }}>{pace.text}{pace.toGo ? ` · ${pace.toGo}` : ""}</Text>
      {done >= goal.targetBooks && <Text variant="muted">Every book from here is a bonus.</Text>}
      {streak && <Text variant="muted">{streak}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, padding: 16, gap: 10 },
  chips: { flexDirection: "row", gap: 8 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
});
