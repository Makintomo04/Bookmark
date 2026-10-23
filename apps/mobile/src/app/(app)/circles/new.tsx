import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { progressScale } from "@bookmark/shared/progress";
import { BookCover } from "@/components/books/BookCover";
import { ScheduleEditor, scheduleOf, type ScheduleRow } from "@/components/circles/ScheduleEditor";
import { DateField, dayOf } from "@/components/ui/DateField";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";
import { useBooks, type Book } from "@/lib/books";
import { useTheme } from "@/lib/theme";

// Starting a reading circle (the web's /circles/new): pick the book from your shelf, or find another,
// set the start date and, if you like, a schedule, then start. Inviting happens from the circle itself.

const SHELF: Partial<Record<Book["status"], string>> = { STARTED: "Reading", PAUSED: "Paused", NOT_STARTED: "Want to read" };

export default function NewCircle() {
  const { bookId } = useLocalSearchParams<{ bookId?: string }>();
  const { data: books, isLoading } = useBooks();
  const { colors, radii } = useTheme();
  const [chosen, setChosen] = useState<string | null>(bookId ?? null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState(() => dayOf(new Date()));
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const candidates = (books ?? []).filter((b) => SHELF[b.status]);
  const book = books?.find((b) => b.id === chosen) ?? null;
  // Pages or minutes: either works, as long as there's a length to measure progress against.
  const hasLength = !!book && progressScale(book).total > 0;

  const start = async () => {
    if (!book) return;
    setStarting(true);
    setError(null);
    try {
      const schedule = scheduleOf(rows);
      const circle = await api.post<{ id: string }>("/api/buddy-reads", {
        bookId: book.id,
        // Local midnight on the chosen day.
        startsAt: new Date(`${startsOn}T00:00:00`).toISOString(),
        ...(schedule.length && { schedule }),
      });
      router.replace(`/circles/${circle.id}?invite=1`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start the circle. Try again.");
      setStarting(false);
    }
  };

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;

  if (book) {
    return (
      <Screen>
        <View style={styles.bookRow}>
          <BookCover book={book} width={88} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="title" style={{ fontSize: 20, lineHeight: 26 }}>{book.title}</Text>
            <Text variant="muted">{book.author}</Text>
          </View>
        </View>
        <Text>Everyone reads their own copy, in any edition or on audio. Comments are pinned to where they were written and stay locked until each reader gets there.</Text>
        {!hasLength && (
          <View style={{ gap: 4, alignItems: "flex-start" }}>
            <Notice tone="error" message="This book has no page count or running time, so progress can't be tracked. Add one first." />
            <Button title="Edit details" variant="ghost" onPress={() => router.push(`/book/edit/${book.id}`)} />
          </View>
        )}
        <DateField label="Start date" value={startsOn} onChange={(day) => day && setStartsOn(day)} />
        <View style={{ gap: 6 }}>
          <Text variant="label">Schedule · optional</Text>
          <ScheduleEditor rows={rows} onChange={setRows} disabled={starting} />
        </View>
        {error && <Notice tone="error" message={error} />}
        <Button title="Start and get the link" loading={starting} disabled={!hasLength} onPress={start} />
        {!bookId && <Button title="Choose another book" variant="ghost" disabled={starting} onPress={() => setChosen(null)} />}
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="title">Which book?</Text>
      {candidates.length === 0 && <Text variant="muted">Nothing on Reading or Want to read yet. Find the book to start with.</Text>}
      {candidates.map((b) => (
        <Pressable
          key={b.id}
          accessibilityRole="button"
          accessibilityLabel={`${b.title} by ${b.author}`}
          onPress={() => setChosen(b.id)}
          style={({ pressed }) => [styles.row, { borderRadius: radii.md, backgroundColor: pressed ? colors.muted : "transparent" }]}
        >
          <BookCover book={b} width={44} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2}>{b.title}</Text>
            <Text variant="small">{b.author} · {SHELF[b.status]}</Text>
          </View>
        </Pressable>
      ))}
      <Button title="Find another book" variant="outline" onPress={() => router.replace("/add-book?shelf=STARTED&startCircle=1")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bookRow: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 8 },
});
