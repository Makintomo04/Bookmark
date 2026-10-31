import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { clockLabel, formatMinute, parseMinute, REMINDER_STEP } from "@bookmark/shared/reminders";
import { useTheme } from "@/lib/theme";
import { Text } from "./Text";

// A time of day, as "HH:MM", rounded to the quarter hour (the reminders' step). The phone's own time
// picker: a dialog on Android, a spinner on iPhone. TimeField.web.tsx picks from a list for the web build.

const toDate = (value: string) => {
  const minute = parseMinute(value) ?? 0;
  const date = new Date();
  date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return date;
};
const fromDate = (date: Date) => {
  const minute = Math.round((date.getHours() * 60 + date.getMinutes()) / REMINDER_STEP) * REMINDER_STEP;
  return formatMinute(minute % (24 * 60));
};

export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void; options?: number[] }) {
  const { colors, radii, fonts, scheme } = useTheme();
  const [iosOpen, setIosOpen] = useState(false);

  const open = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({ value: toDate(value), mode: "time", minuteInterval: REMINDER_STEP, onChange: (event, date) => { if (event.type === "set" && date) onChange(fromDate(date)); } });
    } else {
      setIosOpen(!iosOpen);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${clockLabel(parseMinute(value) ?? 0)}`} onPress={open} style={[styles.field, { borderRadius: radii.md, borderColor: colors.input }]}>
        <Text style={{ fontFamily: fonts.sans }}>{clockLabel(parseMinute(value) ?? 0)}</Text>
      </Pressable>
      {Platform.OS === "ios" && iosOpen && (
        <DateTimePicker value={toDate(value)} mode="time" display="spinner" minuteInterval={REMINDER_STEP} themeVariant={scheme} accentColor={colors.brandFill} onChange={(_, date) => { if (date) onChange(fromDate(date)); }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 44, minWidth: 96, borderWidth: 1, paddingHorizontal: 12, justifyContent: "center", alignSelf: "flex-start" },
});
