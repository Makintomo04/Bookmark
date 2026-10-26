import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import useSWR from "swr";
import { BookCover } from "@/components/books/BookCover";
import { FollowSeries } from "@/components/series/FollowSeries";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { ApiError } from "@/lib/api";
import { authorPageKey, setFollowingAuthor, type AuthorPage } from "@/lib/authors";
import { addBook } from "@/lib/discover";
import { useTheme } from "@/lib/theme";

// One author (the web's /authors/<slug>): Follow, about them, their series, and their books, most read first. Tap a
// book to add it. The first page of books only; the web has the rest.
export default function Author() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors, radii } = useTheme();
  const { data, error, isLoading } = useSWR<AuthorPage>(slug ? authorPageKey(slug) : null);
  const [showBio, setShowBio] = useState(false);

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (error || !data) return <Screen><Notice tone="error" message={error instanceof ApiError && error.status === 404 ? "We couldn't find that author." : "Couldn't load this author. Try again."} /></Screen>;

  const { author, about } = data;
  const bio = about?.bio ?? [];
  return (
    <Screen>
      <Stack.Screen options={{ title: "" }} />
      <View style={styles.header}>
        {about?.photoUrl ? <Image source={{ uri: about.photoUrl }} accessibilityIgnoresInvertColors style={[styles.photo, { borderRadius: radii.md }]} /> : null}
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="small">Author</Text>
          <Text variant="display">{author.name}</Text>
          {data.total ? <Text variant="muted">{data.total.toLocaleString("en-GB")} {data.total === 1 ? "book" : "books"}</Text> : null}
        </View>
      </View>
      {data.canFollow && <FollowAuthor slug={author.slug} name={author.name} following={!!data.isFollowing} />}
      {bio.length > 0 && (
        <View style={{ gap: 8 }}>
          {(showBio ? bio : bio.slice(0, 1)).map((p, i) => <Text key={i} numberOfLines={showBio ? undefined : 5}>{p}</Text>)}
          <View style={{ alignItems: "flex-start" }}>
            <Button title={showBio ? "Show less" : "Read more"} variant="ghost" onPress={() => setShowBio(!showBio)} />
          </View>
        </View>
      )}
      {data.series && data.series.length > 0 && (
        <View style={{ gap: 12 }}>
          <Text variant="title">Series</Text>
          {data.series.map((s) => (
            <View key={s.key} style={styles.seriesRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={2}>{s.name}</Text>
                <Text variant="small">{s.count === 1 ? "1 book on Bookmark" : `${s.count} books on Bookmark`}</Text>
              </View>
              <FollowSeries name={s.name} author={s.author} following={s.isFollowing} refreshKey={authorPageKey(author.slug)} />
            </View>
          ))}
        </View>
      )}
      {data.failed && <Notice message="Couldn't load this author's books right now. Try again later." />}
      {data.books.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text variant="title">Books</Text>
          <View style={styles.grid}>
            {data.books.map((book, i) => (
              <Pressable key={`${book.workKey ?? book.title}-${i}`} accessibilityRole="button" accessibilityLabel={`${book.title}. Add it.`} onPress={() => addBook(book)} style={styles.book}>
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

function FollowAuthor({ slug, name, following }: { slug: string; name: string; following: boolean }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const toggle = async () => {
    setBusy(true);
    setNote(null);
    try {
      await setFollowingAuthor(slug, !following);
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : following ? `Couldn't unfollow ${name}. Try again.` : `Couldn't follow ${name}. Try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Button
        title={following ? "Following" : "Follow"}
        variant={following ? "outline" : "primary"}
        loading={busy}
        onPress={toggle}
        accessibilityHint={following ? `Unfollows ${name}` : undefined}
      />
      {note ? <Notice tone="error" message={note} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", gap: 16, alignItems: "flex-end" },
  photo: { width: 88, height: 120 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  book: { width: 100, gap: 4 },
  seriesRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
