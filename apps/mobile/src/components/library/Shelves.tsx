import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { formatPosition, progressWhole } from "@bookmark/shared/progress";
import { BookCover } from "@/components/books/BookCover";
import { Text } from "@/components/ui/Text";
import { groupShelf, isRereading, type Book } from "@/lib/books";
import { useTheme } from "@/lib/theme";

const openBook = (book: Book) => router.push(`/book/${book.id}`);

// Currently reading, as cards with progress; the other shelves as rows of covers (the web's BookList).
export function Shelves({ books, accent }: { books: Book[]; accent: string }) {
  const shelf = groupShelf(books);
  return (
    <View style={{ gap: 28 }}>
      <Section title="Currently reading" count={shelf.reading.length}>
        {shelf.reading.length === 0 ? (
          <Text variant="muted">Nothing on the go. Add a book or start one from Want to read.</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {shelf.reading.map((book) => <ReadingCard key={book.id} book={book} accent={accent} rereading={isRereading(book, shelf.finished)} />)}
          </View>
        )}
      </Section>
      <CoverRow title="Want to read" books={shelf.wantToRead} accent={accent} />
      <CoverRow title="Finished" books={shelf.finished} accent={accent} />
      <CoverRow title="Paused" books={shelf.paused} accent={accent} />
      <CoverRow title="Did not finish" books={shelf.didNotFinish} accent={accent} />
      <CoverRow title="Will not read" books={shelf.notInterested} accent={accent} />
    </View>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.heading} accessibilityRole="header">
        <Text variant="title">{title}</Text>
        <Text variant="muted">{count}</Text>
      </View>
      {children}
    </View>
  );
}

function ReadingCard({ book, accent, rereading }: { book: Book; accent: string; rereading: boolean }) {
  const { colors, radii } = useTheme();
  const percent = progressWhole(book);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${book.title} by ${book.author}, ${percent}%`}
      onPress={() => openBook(book)}
      style={({ pressed }) => [styles.card, { borderRadius: radii.lg, borderColor: colors.border, backgroundColor: pressed ? colors.muted : "transparent" }]}
    >
      <BookCover book={book} width={64} fallbackColour={accent} />
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

function CoverRow({ title, books, accent }: { title: string; books: Book[]; accent: string }) {
  if (books.length === 0) return null;
  return (
    <Section title={title} count={books.length}>
      <FlatList
        horizontal
        data={books}
        keyExtractor={(b) => b.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12 }}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.title} by ${item.author}`} onPress={() => openBook(item)} style={{ width: 96, gap: 6 }}>
            <BookCover book={item} width={96} fallbackColour={accent} />
            <Text variant="small" numberOfLines={2}>{item.title}</Text>
          </Pressable>
        )}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  card: { flexDirection: "row", gap: 14, padding: 12, borderWidth: 1, alignItems: "center" },
  track: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 6 },
  fill: { height: 6, borderRadius: 3 },
});
