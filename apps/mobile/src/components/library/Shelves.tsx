import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Check, ChevronRight } from "lucide-react-native";
import { formatPosition, progressWhole } from "@bookmark/shared/progress";
import { SHELF_STATUS, type ShelfKey } from "@bookmark/shared/shelfFilter";
import { BookCover } from "@/components/books/BookCover";
import { Text } from "@/components/ui/Text";
import { shelfSelection, type Book, type Library, type PickedBook } from "@/lib/books";
import { useTheme } from "@/lib/theme";

const openBook = (book: Book) => router.push(`/book/${book.id}`);
// A shelf on its own screen, searched, sorted and filtered a page at a time ("all" for every shelf).
export const openShelf = (shelf: ShelfKey | "all") => router.push(`/shelf/${shelf}`);

// The Library tab shows the first few books of each shelf (LIBRARY_PREVIEW, from the server), and See all has
// the rest: a shelf of a thousand books drew every cover in its row before. Covers are a fixed width, so the
// rows skip measuring them.
const COVER = 96;
const COVER_GAP = 12;
const count = (n: number) => n.toLocaleString("en-GB");

// Select mode: a tap picks a book instead of opening it, and each shelf can pick all of itself. There is no
// cap; SelectionBar sends big selections in batches. Picked books are kept, not just their ids, because the
// Library has only the start of each shelf and Select all fetches the rest (shelfSelection).
export function useBookSelection() {
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Map<string, PickedBook>>(new Map());
  return {
    selecting,
    picked,
    start: () => setSelecting(true),
    stop: () => { setSelecting(false); setPicked(new Map()); },
    clear: () => setPicked(new Map()),
    toggle: (book: PickedBook) => setPicked((prev) => {
      const next = new Map(prev);
      if (!next.delete(book.id)) next.set(book.id, book);
      return next;
    }),
    toggleAll: (items: PickedBook[]) => setPicked((prev) => {
      const next = new Map(prev);
      const all = items.every((b) => next.has(b.id));
      for (const b of items) { if (all) next.delete(b.id); else next.set(b.id, b); }
      return next;
    }),
  };
}
export type BookSelection = ReturnType<typeof useBookSelection>;

// Currently reading, as cards with progress; the other shelves as rows of covers (the web's BookList). Each
// shows the start of the shelf (useLibrary) with its full count, and See all opens the rest.
export function Shelves({ library, accent, selection }: { library: Library; accent: string; selection: BookSelection }) {
  const { shelves, counts } = library;
  const rereading = new Set(library.rereading);
  return (
    <View style={{ gap: 28 }}>
      <Section title="Currently reading" shelf="reading" total={counts.reading} selection={selection}>
        {shelves.reading.length === 0 ? (
          <Text variant="muted">Nothing on the go. Add a book or start one from Want to read.</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {shelves.reading.map((book) => <ReadingCard key={book.id} book={book} accent={accent} rereading={rereading.has(book.id)} selection={selection} />)}
          </View>
        )}
      </Section>
      <CoverRow title="Want to read" shelf="want" books={shelves.want} total={counts.want} accent={accent} selection={selection} />
      <CoverRow title="Finished" shelf="finished" books={shelves.finished} total={counts.finished} accent={accent} selection={selection} />
      <CoverRow title="Paused" shelf="paused" books={shelves.paused} total={counts.paused} accent={accent} selection={selection} />
      <CoverRow title="Did not finish" shelf="dnf" books={shelves.dnf} total={counts.dnf} accent={accent} selection={selection} />
      <CoverRow title="Will not read" shelf="notInterested" books={shelves.notInterested} total={counts.notInterested} accent={accent} selection={selection} />
    </View>
  );
}

// `total` is the whole shelf, so Select all picks every book on it (fetched then), not just the ones showing.
// Out of select mode the same corner opens the shelf's own screen.
function Section({ title, shelf, total, selection, children }: { title: string; shelf: ShelfKey; total: number; selection: BookSelection; children: React.ReactNode }) {
  const [fetching, setFetching] = useState(false);
  const pickedHere = Array.from(selection.picked.values()).filter((b) => b.status === SHELF_STATUS[shelf]).length;
  const all = total > 0 && pickedHere >= total;
  const selectAll = async () => {
    setFetching(true);
    try {
      selection.toggleAll(await shelfSelection(shelf));
    } catch {
      Alert.alert("Couldn't select the shelf", "Check your connection and try again.");
    } finally {
      setFetching(false);
    }
  };
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.heading} accessibilityRole="header">
        <Text variant="title">{title}</Text>
        <Text variant="muted">{count(total)}</Text>
        {selection.selecting && total > 0 && (
          <Pressable accessibilityRole="button" disabled={fetching} onPress={() => void selectAll()} hitSlop={8} style={{ marginLeft: "auto" }}>
            <Text variant="small" style={{ textDecorationLine: "underline", opacity: fetching ? 0.5 : 1 }}>{all ? "Deselect all" : `Select all ${count(total)}`}</Text>
          </Pressable>
        )}
        {!selection.selecting && total > 0 && (
          <Pressable accessibilityRole="link" accessibilityLabel={`See all ${count(total)} in ${title}`} onPress={() => openShelf(shelf)} hitSlop={8} style={{ marginLeft: "auto" }}>
            <Text variant="small" style={{ textDecorationLine: "underline" }}>See all {count(total)}</Text>
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
      onPress={() => (selection.selecting ? selection.toggle(book) : openBook(book))}
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

function CoverRow({ title, shelf, books, total, accent, selection }: { title: string; shelf: ShelfKey; books: Book[]; total: number; accent: string; selection: BookSelection }) {
  const { colors, radii } = useTheme();
  if (books.length === 0) return null;
  const more = total > books.length;
  return (
    <Section title={title} shelf={shelf} total={total} selection={selection}>
      <FlatList
        horizontal
        data={books}
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
            onPress={() => (selection.selecting ? selection.toggle(item) : openBook(item))}
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
            accessibilityLabel={`See all ${count(total)} in ${title}`}
            onPress={() => openShelf(shelf)}
            style={({ pressed }) => [styles.more, { width: COVER, height: COVER * 1.5, borderRadius: radii.sm, borderColor: colors.border, backgroundColor: pressed ? colors.muted : "transparent" }]}
          >
            <ChevronRight size={22} color={colors.mutedForeground} />
            <Text variant="small" style={{ textAlign: "center" }}>See all{"\n"}{count(total)}</Text>
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
