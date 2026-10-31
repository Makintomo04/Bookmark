import { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Pencil, Plus, Trash2 } from "lucide-react-native";
import { formatMinutes } from "@bookmark/shared/progress";
import { StarRating } from "@/components/books/StarRating";
import { Button } from "@/components/ui/Button";
import { DateField, dayOf } from "@/components/ui/DateField";
import { Notice } from "@/components/ui/Notice";
import { Segmented } from "@/components/ui/Segmented";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";
import { formatDay, refreshAfterBookChange, type BookRead, type Status } from "@/lib/books";
import { useTheme } from "@/lib/theme";

// The book's reads, newest first, each with its dates (and that read's rating) to fix, and removable, with a
// form to log an earlier read: the web's ReadHistory. The book's own dates, read count and stats follow on
// the server (api/books/[bookId]/reads).

type Ended = "COMPLETED" | "DNF";
interface Draft { status: Ended; started: string | null; finished: string | null; rating: number }

// Reads in progress only have a start date; their progress is logged as usual.
const isOpen = (status: Status) => status === "STARTED" || status === "PAUSED";
// Dates are stored at noon UTC on the day picked, so the first ten characters are that day.
const day = (date: string | null) => (date ? date.slice(0, 10) : null);

const readRange = (start: string | null, end: string | null) =>
  start && end ? `${formatDay(start)} – ${formatDay(end)}`
    : start ? `Started ${formatDay(start)}`
    : end ? formatDay(end)
    : "No dates";

const readLabel = (read: BookRead) =>
  read.status === "COMPLETED" ? "Finished"
    : read.status === "DNF" ? `Did not finish${read.currentPercent != null ? ` · ${Math.round(read.currentPercent)}%` : read.stoppedAtMinute !== null ? ` · ${formatMinutes(read.stoppedAtMinute)}` : read.stoppedAtPage !== null ? ` · page ${read.stoppedAtPage}` : ""}`
    : read.status === "PAUSED" ? "Paused"
    : "Reading now";

export function ReadHistory({ bookId, bookStatus, reads, onChange }: {
  bookId: string;
  bookStatus: Status;
  reads: BookRead[];
  // After any change: the reads as saved, for the caller's copy.
  onChange: (reads: BookRead[]) => void;
}) {
  const { colors, fonts } = useTheme();
  // The read being edited, or "new" for an earlier read being added.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ status: "COMPLETED", started: null, finished: null, rating: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = reads.slice().reverse();
  // Only ended reads can be added after the fact, to a book that has been read at all.
  const canAdd = bookStatus !== "NOT_STARTED" && bookStatus !== "NOT_INTERESTED";

  if (history.length === 0 && !canAdd) return null;

  const edit = (read: BookRead) => {
    setDraft({ status: read.status === "DNF" ? "DNF" : "COMPLETED", started: day(read.startedAt), finished: day(read.finishedAt), rating: read.rating ?? 0 });
    setError(null);
    setEditing(read.id);
  };
  const startAdding = () => {
    setDraft({ status: "COMPLETED", started: null, finished: null, rating: 0 });
    setError(null);
    setEditing("new");
  };

  const run = async (request: Promise<BookRead[]>) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await request);
      setEditing(null);
      await refreshAfterBookChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save that read. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = (read: BookRead | null) => {
    const today = dayOf(new Date());
    if (draft.started && draft.finished && draft.started > draft.finished) return setError("The start date is after the finish date");
    if ((draft.started && draft.started > today) || (draft.finished && draft.finished > today)) return setError("That date is in the future");
    const open = read && isOpen(read.status);
    const body = {
      startedAt: draft.started,
      ...(!open && { finishedAt: draft.finished, rating: draft.rating > 0 ? draft.rating : null }),
    };
    if (!read) void run(api.post<BookRead[]>(`/api/books/${bookId}/reads`, { status: draft.status, ...body }));
    else void run(api.patch<BookRead[]>(`/api/books/${bookId}/reads/${read.id}`, body));
  };

  const remove = (read: BookRead) => {
    Alert.alert("Remove this read from the book's history?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void run(api.delete<BookRead[]>(`/api/books/${bookId}/reads/${read.id}`)) },
    ]);
  };

  const form = (read: BookRead | null) => {
    const open = read && isOpen(read.status);
    return (
      <View style={{ gap: 12, paddingVertical: 12 }}>
        {!read && (
          <Segmented
            label="How it ended"
            options={[{ value: "COMPLETED", label: "Finished" }, { value: "DNF", label: "Did not finish" }]}
            value={draft.status}
            onChange={(status) => setDraft({ ...draft, status })}
            disabled={busy}
          />
        )}
        <DateField label="Started" value={draft.started} onChange={(started) => setDraft({ ...draft, started })} optional />
        {!open && (
          <DateField label={draft.status === "DNF" ? "Stopped" : "Finished"} value={draft.finished} onChange={(finished) => setDraft({ ...draft, finished })} optional />
        )}
        {!open && (
          <View style={{ gap: 6 }}>
            <Text variant="label">Rating for this read</Text>
            <StarRating value={draft.rating} onChange={(rating) => setDraft({ ...draft, rating })} disabled={busy} size={24} label="Rating for this read" />
          </View>
        )}
        <Text variant="small">Leave a date empty if you don{"’"}t remember it.</Text>
        <View style={styles.formActions}>
          <View style={{ flex: 1 }}><Button title={read ? "Save" : "Add read"} loading={busy} onPress={() => save(read)} /></View>
          <Button title="Cancel" variant="ghost" disabled={busy} onPress={() => { setEditing(null); setError(null); }} />
        </View>
      </View>
    );
  };

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.heading}>
        <Text variant="label" accessibilityRole="header">Reading history</Text>
        {canAdd && editing !== "new" && (
          <Pressable accessibilityRole="button" onPress={startAdding} disabled={busy} hitSlop={8} style={styles.add}>
            <Plus size={14} color={colors.mutedForeground} />
            <Text variant="small" style={{ textDecorationLine: "underline" }}>Add an earlier read</Text>
          </Pressable>
        )}
      </View>
      {error && <Notice tone="error" message={error} />}
      {editing === "new" && form(null)}
      {history.map((read) => editing === read.id ? (
        <View key={read.id} style={[styles.row, { borderBottomColor: colors.border }]}>{form(read)}</View>
      ) : (
        <View key={read.id} style={[styles.row, styles.readRow, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.sansMedium }}>{readLabel(read)}</Text>
            <Text variant="small">{readRange(read.startedAt, read.finishedAt)}</Text>
          </View>
          {read.rating ? <StarRating value={read.rating} size={14} label="Rating" /> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Edit this read" onPress={() => edit(read)} disabled={busy} hitSlop={6} style={styles.icon}>
            <Pencil size={16} color={colors.mutedForeground} />
          </Pressable>
          {!isOpen(read.status) && (
            <Pressable accessibilityRole="button" accessibilityLabel="Remove this read" onPress={() => remove(read)} disabled={busy} hitSlop={6} style={styles.icon}>
              <Trash2 size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 32 },
  add: { flexDirection: "row", alignItems: "center", gap: 4 },
  row: { borderBottomWidth: StyleSheet.hairlineWidth },
  readRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  icon: { padding: 6 },
  formActions: { flexDirection: "row", alignItems: "center", gap: 12 },
});
