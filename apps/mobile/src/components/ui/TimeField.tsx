import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { clockLabel, formatMinute, parseMinute, REMINDER_STEP } from "@bookmark/shared/reminders";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

// A time of day, as "HH:MM", on the quarter hour (the reminders' step). The phone's own time picker: a
// dialog on Android, a spinner on iPhone that saves once, on Done, rather than on every turn of the wheel.
// With `options`, a time outside them moves to the nearest allowed one (a reminder can't sit in quiet
// hours). TimeField.web.tsx steps through the options for the web build.

const toDate = (minute: number) => {
  const date = new Date();
  date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return date;
};
const minuteOf = (date: Date) => (Math.round((date.getHours() * 60 + date.getMinutes()) / REMINDER_STEP) * REMINDER_STEP) % (24 * 60);

// The allowed minute closest to `minute` around the clock, or `minute` when anything goes.
function nearest(minute: number, options?: number[]) {
  if (!options || options.length === 0 || options.includes(minute)) return minute;
  const gap = (m: number) => Math.min(Math.abs(m - minute), 24 * 60 - Math.abs(m - minute));
  return options.reduce((best, m) => (gap(m) < gap(best) ? m : best), options[0]);
}

export function TimeField({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options?: number[]; disabled?: boolean }) {
  const { colors, radii, fonts, scheme } = useTheme();
  const current = parseMinute(value) ?? 0;
  // The iPhone spinner's choice while it's open; committed on Done.
  const [picking, setPicking] = useState<number | null>(null);

  const commit = (minute: number) => {
    const allowed = nearest(minute, options);
    if (allowed !== current) onChange(formatMinute(allowed));
  };

  const open = () => {
    if (disabled) return;
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({ value: toDate(current), mode: "time", minuteInterval: REMINDER_STEP, onChange: (event, date) => { if (event.type === "set" && date) commit(minuteOf(date)); } });
    } else {
      // Tapping the field again closes the spinner and keeps what it shows, like Done.
      if (picking === null) setPicking(current);
      else done();
    }
  };

  const done = () => {
    if (picking !== null) commit(picking);
    setPicking(null);
  };

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${clockLabel(current)}`}
          accessibilityState={{ disabled: !!disabled }}
          onPress={open}
          style={[styles.field, { borderRadius: radii.md, borderColor: colors.input, opacity: disabled ? 0.6 : 1 }]}
        >
          <Text style={{ fontFamily: fonts.sans }}>{clockLabel(current)}</Text>
        </Pressable>
        {picking !== null && (
          <Pressable accessibilityRole="button" onPress={done} hitSlop={8}>
            <Text variant="label" style={{ color: colors.brandText }}>Done</Text>
          </Pressable>
        )}
      </View>
      {Platform.OS === "ios" && picking !== null && (
        <DateTimePicker value={toDate(picking)} mode="time" display="spinner" minuteInterval={REMINDER_STEP} themeVariant={scheme} accentColor={colors.brandFill} onChange={(_, date) => { if (date) setPicking(minuteOf(date)); }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  field: { minHeight: 44, minWidth: 96, borderWidth: 1, paddingHorizontal: 12, justifyContent: "center", alignSelf: "flex-start" },
});
