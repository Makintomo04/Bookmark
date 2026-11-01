import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
// Its own fetcher: see the shelf screen (swr/infinite may not see the app's SWRConfig).
import { fetcher } from "@/lib/api";
import { DEFAULT_COLOUR, readerName } from "@bookmark/shared/profile";
import { pagedBooks } from "@bookmark/shared/shelfFilter";
import { BookCover } from "@/components/books/BookCover";
import { StarRating } from "@/components/books/StarRating";
import { ReviewText } from "@/components/social/ReviewText";
import { ReportReview } from "@/components/social/ReportReview";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// Another reader's reviews, newest finish first, 20 at a time as the list scrolls (the web's
// /u/<username>/reviews). Their profile carries the newest five; this is its See all. The server applies their
// privacy, so only reviews you may read arrive.

type ReviewedBook = {
  id: string;
  title: string;
  author: string;
  coverImage: string;
  cardColour: string | null;
  rating: number | null;
  review: string;
  reviewSpoiler: boolean;
};
type ReviewsPage = { books: ReviewedBook[]; total: number; nextCursor: string | null };

const PAGE = 20;

export default function ReaderReviewsScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { colors } = useTheme();
  const name = encodeURIComponent(username ?? "");
  const { data: profile } = useSWR<{ username: string; displayName?: string | null; favColour: string | null }>(username ? `/api/users/${name}?books=0` : null);
  const accent = profile?.favColour || DEFAULT_COLOUR;
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<ReviewsPage>((index, previous: ReviewsPage | null) => {
    if (!username || (previous && !previous.nextCursor)) return null;
    return `/api/users/${name}/reviews?take=${PAGE}${previous?.nextCursor ? `&cursor=${previous.nextCursor}` : ""}`;
  }, fetcher);
  const books = pagedBooks(data ?? []);
  const total = data?.[0]?.total;
  const more = !!data?.[data.length - 1]?.nextCursor;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: profile ? `${readerName(profile)}: reviews` : "Reviews" }} />
      <FlatList
        data={books}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />}
        ListHeaderComponent={total !== undefined ? <Text variant="muted">{total === 1 ? "1 review" : `${total.toLocaleString("en-GB")} reviews`}</Text> : undefined}
        ListEmptyComponent={isLoading ? <ActivityIndicator color={colors.mutedForeground} /> : error ? (
          <View style={{ gap: 8 }}>
            <Notice tone="error" message="We couldn't load these reviews. Check your connection." />
            <Button title="Try again" variant="outline" onPress={() => mutate()} />
          </View>
        ) : <Text variant="muted">No reviews to show.</Text>}
        ListFooterComponent={isValidating && !!data && size > data.length ? <ActivityIndicator color={colors.mutedForeground} /> : undefined}
        onEndReachedThreshold={0.6}
        onEndReached={() => { if (more && !isValidating) void setSize(size + 1); }}
        initialNumToRender={6}
        windowSize={7}
        renderItem={({ item }) => (
          <View style={{ gap: 6, paddingVertical: 14 }}>
            <View style={styles.row}>
              <BookCover book={item} width={36} fallbackColour={accent} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1}>{item.title}</Text>
                <Text variant="small" numberOfLines={1}>{item.author}</Text>
                {item.rating ? <StarRating value={item.rating} size={14} /> : null}
              </View>
            </View>
            <ReviewText review={item.review} spoiler={item.reviewSpoiler} />
            <ReportReview bookId={item.id} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
