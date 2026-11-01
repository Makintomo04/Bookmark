import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import { EyeOff, SlidersHorizontal } from "lucide-react-native";
import { joinLabels } from "@bookmark/shared/genres";
import { BookCover } from "@/components/books/BookCover";
import { Text } from "@/components/ui/Text";
import { openOrAdd, tileAction, useOnShelf } from "@/lib/discover";
import type { FoundBook } from "@/lib/useBookSearch";
import { useTheme } from "@/lib/theme";

export interface GenrePicksData {
  genres: { slug: string; label: string }[];
  books: FoundBook[];
}

// The genre picks (the web's GenrePicks): popular books from the genres picked in onboarding or Settings.
// Shows nothing until it has books, so a reader without favourite genres never sees an empty box.
// On a new shelf it's a welcome ("Somewhere to start"); on Discover, one section among the others.
// `onHide` adds "Hide these suggestions" under the row (the library passes it; Discover doesn't).
export function GenrePicks({ placement, onHide }: { placement: "shelf" | "discover"; onHide?: () => void }) {
  const { colors, fonts } = useTheme();
  const { data } = useSWR<GenrePicksData>("/api/discover/for-you");
  const onShelf = useOnShelf(data?.books);
  if (!data || data.books.length === 0) return null;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text variant="title" accessibilityRole="header">{placement === "shelf" ? "Somewhere to start" : "From the genres you picked"}</Text>
        <Text variant="muted">
          {placement === "shelf" ? "Popular with readers who love" : "What readers shelve most in"} {joinLabels(data.genres.map((g) => g.label))}.
        </Text>
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push("/settings")}
        style={({ pressed }) => [styles.change, { borderColor: colors.input, backgroundColor: pressed ? colors.muted : "transparent" }]}
      >
        <SlidersHorizontal size={14} color={colors.foreground} />
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.foreground }}>Change genres</Text>
      </Pressable>
      <FlatList
        horizontal
        data={data.books}
        extraData={onShelf}
        keyExtractor={(book, i) => `${book.workKey ?? book.title}-${i}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12 }}
        renderItem={({ item: book, index }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${book.title} by ${book.author}. ${tileAction(onShelf(index))}`} onPress={() => openOrAdd(book, onShelf(index))} style={styles.book}>
            <BookCover book={{ title: book.title, author: book.author, coverImage: book.coverUrl }} width={100} />
            <Text variant="small" numberOfLines={2}>{book.title}</Text>
            {onShelf(index) && <Text variant="small" style={{ color: colors.mutedForeground }}>On your shelf</Text>}
          </Pressable>
        )}
      />
      {onHide && (
        <Pressable accessibilityRole="button" onPress={onHide} hitSlop={8} style={styles.hide}>
          <EyeOff size={14} color={colors.mutedForeground} />
          <Text variant="small" style={{ color: colors.mutedForeground }}>Hide these suggestions</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  change: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, minHeight: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  hide: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6 },
  book: { width: 100, gap: 4 },
});
