import { View } from "react-native";
import { FORMAT_OPTIONS, type FormatChoice } from "@bookmark/shared/bookFormat";
import { Segmented } from "@/components/ui/Segmented";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";

const digits = (t: string, max: number) => t.replace(/\D/g, "").slice(0, max);

// Format, and the running time an audiobook needs (the web's FormatPicker and running-time fields).
export function FormatFields({ format, onFormat, hours, minutes, onHours, onMinutes, disabled, note }: {
  format: FormatChoice;
  onFormat: (format: FormatChoice) => void;
  hours: string;
  minutes: string;
  onHours: (hours: string) => void;
  onMinutes: (minutes: string) => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Segmented label="Format" options={FORMAT_OPTIONS} value={format} onChange={onFormat} disabled={disabled} />
      {format === "AUDIOBOOK" && (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><TextField label="Hours" value={hours} onChangeText={(t) => onHours(digits(t, 3))} keyboardType="number-pad" placeholder="0" editable={!disabled} /></View>
            <View style={{ flex: 1 }}><TextField label="Minutes" value={minutes} onChangeText={(t) => onMinutes(digits(t, 2))} keyboardType="number-pad" placeholder="00" editable={!disabled} /></View>
          </View>
          <Text variant="small">{note ?? "Progress is logged in minutes listened."}</Text>
        </View>
      )}
    </View>
  );
}
