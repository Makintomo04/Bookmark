import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import useSWR from "swr";
import { BookCover } from "@/components/books/BookCover";
import { StarRating } from "@/components/books/StarRating";
import { Avatar } from "@/components/profile/Avatar";
import { NotificationBell } from "@/components/social/NotificationBell";
import { ReviewText } from "@/components/social/ReviewText";
import { ReportReview } from "@/components/social/ReportReview";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Text } from "@/components/ui/Text";
import { ACTIVITY_COPY, timeAgo, type Activity } from "@/lib/social";
import { useTheme } from "@/lib/theme";

// What the people you follow are reading (the web's /feed): started, finished, rated and reviewed.
export default function Feed() {
  const { colors, fonts } = useTheme();
  // The first page only; paging back is still to do here.
  const { data, error, isLoading, mutate } = useSWR<{ activities: Activity[]; hasMore: boolean }>("/api/feed");
  const [refreshing, setRefreshing] = useState(false);
  const activities = (data?.activities ?? []).filter((a) => a.book);

  const refresh = async () => {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.fill, { backgroundColor: colors.background }]}>
      <FlatList
        data={activities}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.mutedForeground} />}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 8 }}>
            <View style={styles.header}>
              <Text variant="display">Feed</Text>
              <NotificationBell />
            </View>
            {isLoading && <ActivityIndicator color={colors.mutedForeground} />}
            {error && (
              <View style={{ gap: 8 }}>
                <Notice tone="error" message="We couldn't load your feed. Check your connection." />
                <Button title="Try again" variant="outline" onPress={() => mutate()} />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          data ? (
            <View style={{ gap: 10 }}>
              <Text variant="title">Nothing here yet</Text>
              <Text variant="muted">Follow readers to see what they{"’"}re reading, finishing and loving.</Text>
              <Button title="Find readers" variant="outline" onPress={() => router.push("/search")} />
            </View>
          ) : undefined
        }
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
        renderItem={({ item }) => {
          const book = item.book!;
          return (
            <View style={styles.item}>
              <Pressable accessibilityRole="link" accessibilityLabel={`${item.user.username}'s profile`} onPress={() => router.push(`/u/${item.user.username}`)}>
                <Avatar image={item.user.image} name={item.user.username} colour={item.user.favColour} size={40} />
              </Pressable>
              <View style={{ flex: 1, gap: 6 }}>
                <Text>
                  <Text style={{ fontFamily: fonts.sansSemibold }} onPress={() => router.push(`/u/${item.user.username}`)}>{item.user.username}</Text>{" "}
                  {ACTIVITY_COPY[item.type](book.title)}
                </Text>
                <Text variant="small">by {book.author} · {timeAgo(item.createdAt)}</Text>
                {item.type === "RATED_BOOK" && book.rating ? <StarRating value={book.rating} size={14} /> : null}
                {item.type === "REVIEWED_BOOK" && book.review ? <ReviewText review={book.review} spoiler={book.reviewSpoiler} maxChars={220} /> : null}
                {item.type === "REVIEWED_BOOK" && book.review && book.id ? <ReportReview bookId={book.id} /> : null}
              </View>
              <BookCover book={book} width={44} />
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  item: { flexDirection: "row", gap: 12, paddingVertical: 14, alignItems: "flex-start" },
  separator: { height: StyleSheet.hairlineWidth },
});
