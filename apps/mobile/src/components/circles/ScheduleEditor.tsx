import { StyleSheet, View } from "react-native";
import { LABEL_MAX, SCHEDULE_MAX, type BuddyReadSchedule } from "@bookmark/shared/buddyReads";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { useTheme } from "@/lib/theme";

// A reading circle's schedule as the host writes it (the web's NewBuddyReadForm schedule): checkpoints
// to read up to, as a percent so they work in any edition, each with an optional date.

export type ScheduleRow = { label: string; until: string; due: string | null };

export const rowsOf = (schedule: BuddyReadSchedule | null | undefined): ScheduleRow[] =>
  (schedule ?? []).map((s) => ({ label: s.label, until: typeof s.until === "number" ? String(s.until) : "", due: s.due ?? null }));

// What the API takes; rows without a name are left out.
export const scheduleOf = (rows: ScheduleRow[]): BuddyReadSchedule =>
  rows.filter((r) => r.label.trim()).map((r) => ({
    label: r.label.trim(),
    until: r.until === "" ? null : Math.max(0, Math.min(100, Number(r.until))),
    due: r.due || null,
  }));

export function ScheduleEditor({ rows, onChange, disabled }: { rows: ScheduleRow[]; onChange: (rows: ScheduleRow[]) => void; disabled?: boolean }) {
  const { colors, radii } = useTheme();
  const set = (i: number, patch: Partial<ScheduleRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <View style={{ gap: 12 }}>
      <Text variant="small">Checkpoints to read up to, as a percent so they work in any edition.</Text>
      {rows.map((row, i) => (
        <View key={i} style={[styles.row, { borderRadius: radii.lg, borderColor: colors.border }]}>
          <TextField label={`Checkpoint ${i + 1}`} value={row.label} onChangeText={(t) => set(i, { label: t.slice(0, LABEL_MAX) })} placeholder={"Chapters 1–5"} editable={!disabled} />
          <TextField label="Up to (%)" value={row.until} onChangeText={(t) => set(i, { until: t.replace(/[^\d.]/g, "").slice(0, 5) })} keyboardType="decimal-pad" placeholder="20" editable={!disabled} />
          <DateField label="By · optional" value={row.due} onChange={(due) => set(i, { due })} optional />
          <Button title="Remove checkpoint" variant="ghost" disabled={disabled} onPress={() => onChange(rows.filter((_, j) => j !== i))} />
        </View>
      ))}
      {rows.length < SCHEDULE_MAX && (
        <Button title="Add a checkpoint" variant="outline" disabled={disabled} onPress={() => onChange([...rows, { label: "", until: "", due: null }])} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, padding: 12, borderWidth: 1 },
});
