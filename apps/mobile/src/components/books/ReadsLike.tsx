import { StyleSheet, View } from "react-native";
import { Gauge } from "lucide-react-native";
import {
  PACES, PACE_LABEL, STORY_FOCUSES, STORY_FOCUS_LABEL, readsLike,
  type Pace, type StoryFocus, type TagAggregate,
} from "@bookmark/shared/workTags";
import { Chip } from "@/components/ui/Chip";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// How a book reads, as the web's components/books/WorkTags.tsx shows and asks for it (BOO-104): pace and
// story focus from readers who started it, and whether it ends on a cliffhanger from readers who finished.

// "Fast-paced · Character-driven · Ends on a cliffhanger". Answers from too few readers yet are early:
// alone, the line says so up front; beside settled ones, they're muted.
export function ReadsLikeLine({ tags }: { tags: Pick<TagAggregate, "pace" | "focus" | "cliffhanger"> | undefined }) {
  const { colors } = useTheme();
  const parts = readsLike(tags);
  if (parts.length === 0) return null;
  const allEarly = parts.every((p) => p.early);
  const most = Math.max(...parts.map((p) => p.reports));
  const words = parts.map((p, i) => (i === 0 || !allEarly ? p.text : p.text.toLowerCase())).join(" · ");
  return (
    <View style={styles.row} accessible accessibilityLabel={`${allEarly ? "Early: " : ""}${words}${allEarly ? `, from ${most} readers` : ""}`}>
      <Gauge size={16} color={colors.mutedForeground} />
      <Text variant="muted" style={{ flex: 1 }}>
        {allEarly ? (
          <>
            <Text variant="label">Early: {words}</Text> · from {most} {most === 1 ? "reader" : "readers"}
          </>
        ) : (
          parts.map((p, i) => (
            <Text key={p.key} variant={p.early ? "muted" : "label"}>
              {i > 0 ? " · " : ""}{p.text}
            </Text>
          ))
        )}
      </Text>
    </View>
  );
}

export type ReadsLikeValue = { pace: Pace | null; focus: StoryFocus | null; cliffhanger: boolean | null };

function Choices<T extends string | boolean>({ label, options, value, onChange, disabled }: {
  label: string;
  options: { value: T; text: string }[];
  value: T | null;
  onChange: (next: T | null) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="small">{label}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => (
          <Chip
            key={String(o.value)}
            label={o.text}
            selected={value === o.value}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === o.value, disabled }}
            onPress={() => onChange(value === o.value ? null : o.value)}
          />
        ))}
      </View>
    </View>
  );
}

// Tapping the chosen answer again clears it. The cliffhanger question shows only to a reader who finished.
export function ReadsLikePicker({ value, onChange, canReportCliffhanger, disabled }: {
  value: ReadsLikeValue;
  onChange: (next: ReadsLikeValue) => void;
  canReportCliffhanger: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Text variant="label">How did it read? <Text variant="muted">· optional</Text></Text>
      <Choices label="Pace" options={PACES.map((p) => ({ value: p, text: PACE_LABEL[p] }))} value={value.pace} onChange={(pace) => onChange({ ...value, pace })} disabled={disabled} />
      <Choices label="Driven by" options={STORY_FOCUSES.map((f) => ({ value: f, text: STORY_FOCUS_LABEL[f] }))} value={value.focus} onChange={(focus) => onChange({ ...value, focus })} disabled={disabled} />
      {canReportCliffhanger && (
        <Choices
          label="Does it end on a cliffhanger?"
          options={[{ value: true, text: "yes" }, { value: false, text: "no" }]}
          value={value.cliffhanger}
          onChange={(cliffhanger) => onChange({ ...value, cliffhanger })}
          disabled={disabled}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
