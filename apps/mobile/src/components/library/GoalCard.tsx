import { useState } from "react";
import { StyleSheet, View } from "react-native";
import useSWR, { mutate } from "swr";
import { GOAL_BOOKS_MAX, type GoalProgress } from "@bookmark/shared/goals";
import { Chip } from "@/components/ui/Chip";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

// This year's reading goal: progress against it, or a quick way to set one (the web's ReadingGoalWidget,
// book count only; page and monthly goals are Plus and come with settings).
const PRESETS = [12, 24, 52];

export function GoalCard({ accent }: { accent: string }) {
  const { colors, radii } = useTheme();
  const year = new Date().getFullYear();
  const { data: goal, isLoading } = useSWR<{ targetBooks: number } | null>(`/api/reading-goal?year=${year}`);
  const { data: progress } = useSWR<GoalProgress>(`/api/reading-goal/progress?year=${year}`);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (isLoading) return null;

  const set = async (targetBooks: number) => {
    if (targetBooks < 1 || targetBooks > GOAL_BOOKS_MAX) return;
    setSaving(targetBooks);
    setError(null);
    try {
      await api.post("/api/reading-goal", { year, targetBooks });
      await mutate((key) => typeof key === "string" && key.startsWith("/api/reading-goal"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your goal. Try again.");
    } finally {
      setSaving(null);
    }
  };

  const box = [styles.box, { borderRadius: radii.lg, borderColor: colors.border }];
  if (!goal) {
    return (
      <View style={box}>
        <Text variant="title">Set a {year} reading goal</Text>
        <Text variant="muted">How many books this year?</Text>
        <View style={styles.chips}>
          {PRESETS.map((n) => <Chip key={n} label={saving === n ? "…" : String(n)} selected={false} disabled={saving !== null} onPress={() => set(n)} />)}
        </View>
        {error && <Text variant="small" style={{ color: colors.danger }}>{error}</Text>}
      </View>
    );
  }

  const done = progress?.books ?? 0;
  const percent = Math.min(100, Math.round((done / goal.targetBooks) * 100));
  return (
    <View style={box} accessible accessibilityLabel={`${year} reading goal: ${done} of ${goal.targetBooks} books`}>
      <View style={styles.line}>
        <Text variant="title">{year} goal</Text>
        <Text variant="muted">{done.toLocaleString("en-GB")} of {goal.targetBooks.toLocaleString("en-GB")} books</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.muted }]}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: accent }]} />
      </View>
      {done >= goal.targetBooks && <Text variant="muted">Goal reached. Every book from here is a bonus.</Text>}
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
