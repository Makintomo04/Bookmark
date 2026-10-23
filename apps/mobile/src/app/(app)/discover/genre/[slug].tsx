import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import useSWR from "swr";
import { genreBySlug } from "@bookmark/shared/genres";
import { BookCover } from "@/components/books/BookCover";
import { ListCard } from "@/components/discover/ListCard";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { addBook, type ListSummary } from "@/lib/discover";
import type { FoundBook } from "@/lib/useBookSearch";
import { useTheme } from "@/lib/theme";

// One genre (the web's /discover/genre/<slug>): Bookmark's picks and readers' lists, then what's
// trending on Open Library. Tap a book to add it.
export default function Genre() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors, radii } = useTheme();
  const { data, isLoading } = useSWR<{ genre: { label: string }; lists: ListSummary[]; books: FoundBook[] }>(`/api/discover/genre/${slug}`);
  const colour = genreBySlug(slug ?? "")?.colour ?? colors.brandFill;

  return (
    <Screen>
      <Stack.Screen options={{ title: data?.genre.label ?? "" }} />
      <View style={[styles.hero, { borderRadius: radii.lg, backgroundColor: colour }]}>
        <Text variant="display" style={{ color: "#ffffff" }}>{data?.genre.label ?? genreBySlug(slug ?? "")?.label}</Text>
      </View>
      {isLoading && <ActivityIndicator color={colors.mutedForeground} />}
      {data && data.lists.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text variant="title">Lists</Text>
          <FlatList horizontal data={data.lists} keyExtractor={(l) => l.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} renderItem={({ item }) => <ListCard list={item} />} />
        </View>
      )}
      {data && data.books.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text variant="title">Trending</Text>
          <View style={styles.grid}>
            {data.books.map((book, i) => (
              <Pressable key={`${book.workKey ?? book.title}-${i}`} accessibilityRole="button" accessibilityLabel={`${book.title} by ${book.author}. Add it.`} onPress={() => addBook(book)} style={styles.book}>
                <BookCover book={{ title: book.title, author: book.author, coverImage: book.coverUrl }} width={100} />
                <Text variant="small" numberOfLines={2}>{book.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 20, minHeight: 100, justifyContent: "flex-end" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  book: { width: 100, gap: 4 },
});
