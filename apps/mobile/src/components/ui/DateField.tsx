import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

// A day, as "YYYY-MM-DD" (what the API stores for schedule dates). The phone's own date picker: a
// dialog on Android, the compact picker on iPhone. DateField.web.tsx types it in for the web build.

const parse = (day: string) => new Date(`${day}T00:00:00`);
const pad = (n: number) => String(n).padStart(2, "0");
export const dayOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const shown = (day: string) => parse(day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function DateField({ label, value, onChange, optional }: { label: string; value: string | null; onChange: (day: string | null) => void; optional?: boolean }) {
  const { colors, radii, fonts, scheme } = useTheme();
  const [iosOpen, setIosOpen] = useState(false);
  const current = value ? parse(value) : new Date();

  const open = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({ value: current, mode: "date", onChange: (event, date) => { if (event.type === "set" && date) onChange(dayOf(date)); } });
    } else {
      setIosOpen(!iosOpen);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ? shown(value) : "none"}`} onPress={open} style={[styles.field, { borderRadius: radii.md, borderColor: colors.input }]}>
          <Text style={{ fontFamily: fonts.sans, color: value ? colors.foreground : colors.mutedForeground }}>{value ? shown(value) : "Choose a date"}</Text>
        </Pressable>
        {optional && value && <Pressable accessibilityRole="button" onPress={() => onChange(null)} hitSlop={8}><Text variant="small" style={{ color: colors.brandText }}>Clear</Text></Pressable>}
      </View>
      {Platform.OS === "ios" && iosOpen && (
        <DateTimePicker value={current} mode="date" display="inline" themeVariant={scheme} accentColor={colors.brandFill} onChange={(_, date) => { if (date) onChange(dayOf(date)); setIosOpen(false); }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  field: { flex: 1, minHeight: 48, borderWidth: 1, paddingHorizontal: 12, justifyContent: "center" },
});
