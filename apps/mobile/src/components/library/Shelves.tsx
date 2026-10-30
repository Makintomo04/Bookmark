import { useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Check } from "lucide-react-native";
import { formatPosition, progressWhole } from "@bookmark/shared/progress";
import { BookCover } from "@/components/books/BookCover";
import { Text } from "@/components/ui/Text";
import { groupShelf, isRereading, type Book } from "@/lib/books";
import { useTheme } from "@/lib/theme";

const openBook = (book: Book) => router.push(`/book/${book.id}`);

// Select mode: a tap picks a book instead of opening it, and each shelf can pick all of itself. There is no
// cap; SelectionBar sends big selections in batches.
export function useBookSelection() {
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  return {
    selecting,
    picked,
    start: () => setSelecting(true),
    stop: () => { setSelecting(false); setPicked(new Set()); },
    clear: () => setPicked(new Set()),
    toggle: (id: string) => setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    }),
    toggleAll: (items: Book[]) => setPicked((prev) => {
      const next = new Set(prev);
      const all = items.every((b) => next.has(b.id));
      for (const b of items) { if (all) next.delete(b.id); else next.add(b.id); }
      return next;
    }),
  };
}
export type BookSelection = ReturnType<typeof useBookSelection>;

// Currently reading, as cards with progress; the other shelves as rows of covers (the web's BookList).
export function Shelves({ books, accent, selection }: { books: Book[]; accent: string; selection: BookSelection }) {
  const shelf = groupShelf(books);
  return (
    <View style={{ gap: 28 }}>
      <Section title="Currently reading" books={shelf.reading} selection={selection}>
        {shelf.reading.length === 0 ? (
          <Text variant="muted">Nothing on the go. Add a book or start one from Want to read.</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {shelf.reading.map((book) => <ReadingCard key={book.id} book={book} accent={accent} rereading={isRereading(book, shelf.finished)} selection={selection} />)}
          </View>
        )}
      </Section>
      <CoverRow title="Want to read" books={shelf.wantToRead} accent={accent} selection={selection} />
      <CoverRow title="Finished" books={shelf.finished} accent={accent} selection={selection} />
      <CoverRow title="Paused" books={shelf.paused} accent={accent} selection={selection} />
      <CoverRow title="Did not finish" books={shelf.didNotFinish} accent={accent} selection={selection} />
      <CoverRow title="Will not read" books={shelf.notInterested} accent={accent} selection={selection} />
    </View>
  );
}

function Section({ title, books, selection, children }: { title: string; books: Book[]; selection: BookSelection; children: React.ReactNode }) {
  const all = books.length > 0 && books.every((b) => selection.picked.has(b.id));
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.heading} accessibilityRole="header">
        <Text variant="title">{title}</Text>
        <Text variant="muted">{books.length}</Text>
        {selection.selecting && books.length > 0 && (
          <Pressable accessibilityRole="button" onPress={() => selection.toggleAll(books)} hitSlop={8} style={{ marginLeft: "auto" }}>
            <Text variant="small" style={{ textDecorationLine: "underline" }}>{all ? "Deselect all" : `Select all ${books.length.toLocaleString("en-GB")}`}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

function ReadingCard({ book, accent, rereading, selection }: { book: Book; accent: string; rereading: boolean; selection: BookSelection }) {
  const { colors, radii } = useTheme();
  const percent = progressWhole(book);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${book.title} by ${book.author}, ${percent}%`}
      accessibilityState={selection.selecting ? { selected: selection.picked.has(book.id) } : undefined}
      onPress={() => (selection.selecting ? selection.toggle(book.id) : openBook(book))}
      style={({ pressed }) => [styles.card, { borderRadius: radii.lg, borderColor: colors.border, backgroundColor: pressed ? colors.muted : "transparent" }]}
    >
      <Pick book={book} selection={selection} accent={accent}><BookCover book={book} width={64} fallbackColour={accent} /></Pick>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 16 }} numberOfLines={2}>{book.title}</Text>
        <Text variant="muted" numberOfLines={1}>{book.author}{rereading ? " · rereading" : ""}</Text>
        <View style={[styles.track, { backgroundColor: colors.muted }]}>
          <View style={[styles.fill, { width: `${percent}%`, backgroundColor: accent }]} />
        </View>
        <Text variant="small">{formatPosition(book, { percent: false })} · {percent}%</Text>
      </View>
    </Pressable>
  );
}

function CoverRow({ title, books, accent, selection }: { title: string; books: Book[]; accent: string; selection: BookSelection }) {
  if (books.length === 0) return null;
  return (
    <Section title={title} books={books} selection={selection}>
      <FlatList
        horizontal
        data={books}
        keyExtractor={(b) => b.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12 }}
        extraData={selection.picked}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title} by ${item.author}`}
            accessibilityState={selection.selecting ? { selected: selection.picked.has(item.id) } : undefined}
            onPress={() => (selection.selecting ? selection.toggle(item.id) : openBook(item))}
            style={{ width: 96, gap: 6 }}
          >
            <Pick book={item} selection={selection} accent={accent}><BookCover book={item} width={96} fallbackColour={accent} /></Pick>
            <Text variant="small" numberOfLines={2}>{item.title}</Text>
          </Pressable>
        )}
      />
    </Section>
  );
}

// A check over the cover in select mode: empty to pick, filled once picked. The white ring keeps it clear of
// any cover, including the plain ones drawn in the reader's own colour.
function Pick({ book, selection, accent, children }: { book: Book; selection: BookSelection; accent: string; children: React.ReactNode }) {
  if (!selection.selecting) return <>{children}</>;
  const on = selection.picked.has(book.id);
  return (
    <View style={{ opacity: on ? 0.75 : 1 }}>
      {children}
      <View style={[styles.check, { backgroundColor: on ? accent : "rgba(0,0,0,0.45)" }]}>
        {on && <Check size={14} color="#ffffff" />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  check: { position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  heading: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  card: { flexDirection: "row", gap: 14, padding: 12, borderWidth: 1, alignItems: "center" },
  track: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 6 },
  fill: { height: 6, borderRadius: 3 },
});
