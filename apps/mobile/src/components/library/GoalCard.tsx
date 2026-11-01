import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import useSWR, { mutate } from "swr";
import { GOAL_BOOKS_MAX, expectedBooks, goalPace, streakText, type GoalProgress, type PaceTone } from "@bookmark/shared/goals";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useRemindersPrompt } from "@/lib/earnMoment";
import type { AskReason } from "@bookmark/shared/reminders";

// This year's reading goal: progress against it and whether that's on pace, or a quick way to set or change
// one (the web's ReadingGoalWidget, book count only; page and monthly goals are Plus and come with settings).
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
  const [editing, setEditing] = useState(false);
  if (isLoading) return null;

  const box = [styles.box, { borderRadius: radii.lg, borderColor: colors.border }];
  // Their streak, so "ends tonight" is in sight before the evening alert (BOO-48).
  const streak = streakText(progress?.streak);
  if (!goal || editing) {
    return (
      <View style={box}>
        <Text variant="title">{goal ? `Change your ${year} goal` : `Set a ${year} reading goal`}</Text>
        <Text variant="muted">How many books this year?</Text>
        <GoalChooser year={year} current={goal?.targetBooks ?? null} onSaved={() => setEditing(false)} />
        {goal && <Button title="Keep it" variant="ghost" onPress={() => setEditing(false)} style={{ alignSelf: "flex-start" }} />}
        {!goal && streak && <Text variant="muted">{streak}</Text>}
      </View>
    );
  }

  const done = progress?.books ?? 0;
  const percent = Math.min(100, Math.round((done / goal.targetBooks) * 100));
  // The same words the web widget uses: "2 ahead of pace · 9 to go", "On pace", "Goal reached".
  const pace = goalPace(done, goal.targetBooks, expectedBooks(year, goal.targetBooks, goal.createdAt, progress?.beforeGoal));
  const paceColour = { ...PACE_COLOURS[scheme], neutral: colors.mutedForeground };
  return (
    <View style={box}>
      <View accessible accessibilityLabel={`${year} reading goal: ${done} of ${goal.targetBooks} books`} style={{ gap: 10 }}>
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
      <Button title="Change goal" variant="ghost" onPress={() => setEditing(true)} accessibilityHint={`Your goal is ${goal.targetBooks} books`} style={{ alignSelf: "flex-start" }} />
    </View>
  );
}

// 12, 24 or 52, or any number up to the cap in "Other" (onboarding's goal step does the same).
function GoalChooser({ year, current, onSaved }: { year: number; current: number | null; onSaved: () => void }) {
  const { colors } = useTheme();
  const [saving, setSaving] = useState<number | null>(null);
  const [custom, setCustom] = useState(current && !PRESETS.includes(current) ? String(current) : "");
  const [error, setError] = useState<string | null>(null);
  const customRef = useRef(custom);
  customRef.current = custom;

  const set = async (targetBooks: number) => {
    if (!Number.isInteger(targetBooks) || targetBooks < 1 || targetBooks > GOAL_BOOKS_MAX) return setError(`Pick a goal between 1 and ${GOAL_BOOKS_MAX} books.`);
    setSaving(targetBooks);
    setError(null);
    try {
      const saved = await api.post<{ askReminders?: AskReason | false }>("/api/reading-goal", { year, targetBooks });
      // Setting a goal is one of the moments reminders are offered, once.
      if (saved?.askReminders) useRemindersPrompt.setState({ asked: saved.askReminders });
      await mutate((key) => typeof key === "string" && key.startsWith("/api/reading-goal"));
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your goal. Try again.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <View style={styles.chips}>
        {PRESETS.map((n) => <Chip key={n} label={saving === n ? "…" : String(n)} selected={current === n} disabled={saving !== null} onPress={() => set(n)} />)}
        <View style={{ width: 110 }}>
          <TextField label="Other" value={custom} onChangeText={setCustom} keyboardType="number-pad" returnKeyType="done" selectTextOnFocus onSubmitEditing={() => set(parseInt(customRef.current, 10))} style={{ minHeight: 36 }} />
        </View>
        {/* A number pad on iOS has no return key, so Other has its own button. */}
        {custom.trim() !== "" && <Button title="Save" variant="outline" loading={saving === parseInt(custom, 10)} disabled={saving !== null} onPress={() => set(parseInt(customRef.current, 10))} />}
      </View>
      {error && <Text variant="small" style={{ color: colors.danger }}>{error}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, padding: 16, gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-end" },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
});
