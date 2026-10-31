import { useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Check, ChevronRight } from "lucide-react-native";
import { formatPosition, progressWhole } from "@bookmark/shared/progress";
import type { ShelfKey } from "@bookmark/shared/shelfFilter";
import { BookCover } from "@/components/books/BookCover";
import { Text } from "@/components/ui/Text";
import { groupShelf, isRereading, type Book } from "@/lib/books";
import { useTheme } from "@/lib/theme";

const openBook = (book: Book) => router.push(`/book/${book.id}`);
// A shelf on its own screen, searched, sorted and filtered a page at a time ("all" for every shelf).
export const openShelf = (shelf: ShelfKey | "all") => router.push(`/shelf/${shelf}`);

// The Library tab shows the first few books of each shelf, and See all has the rest: a shelf of a thousand
// books drew every cover in its row before. Covers are a fixed width, so the rows skip measuring them.
const PREVIEW = 20;
const COVER = 96;
const COVER_GAP = 12;
const count = (n: number) => n.toLocaleString("en-GB");

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
      <Section title="Currently reading" shelf="reading" books={shelf.reading} selection={selection}>
        {shelf.reading.length === 0 ? (
          <Text variant="muted">Nothing on the go. Add a book or start one from Want to read.</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {shelf.reading.slice(0, PREVIEW).map((book) => <ReadingCard key={book.id} book={book} accent={accent} rereading={isRereading(book, shelf.finished)} selection={selection} />)}
          </View>
        )}
      </Section>
      <CoverRow title="Want to read" shelf="want" books={shelf.wantToRead} accent={accent} selection={selection} />
      <CoverRow title="Finished" shelf="finished" books={shelf.finished} accent={accent} selection={selection} />
      <CoverRow title="Paused" shelf="paused" books={shelf.paused} accent={accent} selection={selection} />
      <CoverRow title="Did not finish" shelf="dnf" books={shelf.didNotFinish} accent={accent} selection={selection} />
      <CoverRow title="Will not read" shelf="notInterested" books={shelf.notInterested} accent={accent} selection={selection} />
    </View>
  );
}

// `books` is the whole shelf, so Select all picks every book on it, not just the ones showing. Out of select
// mode the same corner opens the shelf's own screen.
function Section({ title, shelf, books, selection, children }: { title: string; shelf: ShelfKey; books: Book[]; selection: BookSelection; children: React.ReactNode }) {
  const all = books.length > 0 && books.every((b) => selection.picked.has(b.id));
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.heading} accessibilityRole="header">
        <Text variant="title">{title}</Text>
        <Text variant="muted">{count(books.length)}</Text>
        {selection.selecting && books.length > 0 && (
          <Pressable accessibilityRole="button" onPress={() => selection.toggleAll(books)} hitSlop={8} style={{ marginLeft: "auto" }}>
            <Text variant="small" style={{ textDecorationLine: "underline" }}>{all ? "Deselect all" : `Select all ${count(books.length)}`}</Text>
          </Pressable>
        )}
        {!selection.selecting && books.length > 0 && (
          <Pressable accessibilityRole="link" accessibilityLabel={`See all ${count(books.length)} in ${title}`} onPress={() => openShelf(shelf)} hitSlop={8} style={{ marginLeft: "auto" }}>
            <Text variant="small" style={{ textDecorationLine: "underline" }}>See all {count(books.length)}</Text>
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

function CoverRow({ title, shelf, books, accent, selection }: { title: string; shelf: ShelfKey; books: Book[]; accent: string; selection: BookSelection }) {
  const { colors, radii } = useTheme();
  if (books.length === 0) return null;
  const preview = books.slice(0, PREVIEW);
  const more = books.length > preview.length;
  return (
    <Section title={title} shelf={shelf} books={books} selection={selection}>
      <FlatList
        horizontal
        data={preview}
        keyExtractor={(b) => b.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: COVER_GAP }}
        extraData={selection.picked}
        getItemLayout={(_, index) => ({ length: COVER + COVER_GAP, offset: (COVER + COVER_GAP) * index, index })}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={3}
        removeClippedSubviews
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title} by ${item.author}`}
            accessibilityState={selection.selecting ? { selected: selection.picked.has(item.id) } : undefined}
            onPress={() => (selection.selecting ? selection.toggle(item.id) : openBook(item))}
            style={{ width: COVER, gap: 6 }}
          >
            <Pick book={item} selection={selection} accent={accent}><BookCover book={item} width={COVER} fallbackColour={accent} /></Pick>
            <Text variant="small" numberOfLines={2}>{item.title}</Text>
          </Pressable>
        )}
        // The rest of a long shelf, at the end of its row. Select mode stays on the Library, where Select
        // all above still takes the whole shelf.
        ListFooterComponent={more && !selection.selecting ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`See all ${count(books.length)} in ${title}`}
            onPress={() => openShelf(shelf)}
            style={({ pressed }) => [styles.more, { width: COVER, height: COVER * 1.5, borderRadius: radii.sm, borderColor: colors.border, backgroundColor: pressed ? colors.muted : "transparent" }]}
          >
            <ChevronRight size={22} color={colors.mutedForeground} />
            <Text variant="small" style={{ textAlign: "center" }}>See all{"\n"}{count(books.length)}</Text>
          </Pressable>
        ) : undefined}
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
  more: { borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 6 },
});
