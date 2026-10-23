import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import useSWR from "swr";
import { ScheduleEditor, rowsOf, scheduleOf, type ScheduleRow } from "@/components/circles/ScheduleEditor";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";
import type { CircleView } from "@/lib/circles";
import { goBack } from "@/lib/navigation";
import { useTheme } from "@/lib/theme";

// The host changes the circle's schedule. Members see it on the circle straight away.
export default function EditSchedule() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data: view, mutate } = useSWR<CircleView>(`/api/buddy-reads/${id}`);
  const [rows, setRows] = useState<ScheduleRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (view && rows === null) setRows(rowsOf(view.buddyRead.schedule)); }, [view, rows]);
  if (!view || rows === null) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (!view.viewer.isHost) return <Screen><Text variant="muted">Only the host can change the schedule.</Text></Screen>;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const schedule = scheduleOf(rows);
      await api.patch(`/api/buddy-reads/${id}`, { schedule: schedule.length ? schedule : null });
      await mutate();
      goBack(`/circles/${id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save the schedule. Try again.");
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Text variant="title">{view.buddyRead.title}</Text>
      {error && <Notice tone="error" message={error} />}
      <ScheduleEditor rows={rows} onChange={setRows} disabled={saving} />
      <Button title="Save schedule" loading={saving} onPress={save} />
    </Screen>
  );
}
