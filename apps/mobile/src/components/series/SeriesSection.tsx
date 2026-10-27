import { useRef } from "react";
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from "react-native";
import { router } from "expo-router";
import { entryState, isPageBook, positionLabel, progressLabel, type SeriesEntry, type SeriesTrack } from "@bookmark/shared/series";
import { BookCover } from "@/components/books/BookCover";
import { FollowSeries } from "@/components/series/FollowSeries";
import { Text } from "@/components/ui/Text";
import { addBook } from "@/lib/discover";
import { useTheme } from "@/lib/theme";

const COVER = 96;
const GAP = 12;

// A book on your shelf opens there; one that isn't goes to Add a book.
const openEntry = (entry: SeriesEntry) =>
  entry.bookId ? router.push(`/book/${entry.bookId}`) : addBook({ title: entry.title, author: entry.author, coverUrl: entry.coverUrl, workKey: entry.workKey });

// "In this series" on the book screen (the web book page's SeriesSection): the series' books in order, with
// where you have them, and Follow series. The row opens at this book, so book 7 isn't off the edge.
export function SeriesSection({ track, workId, position, refreshKey, accent }: {
  track: SeriesTrack;
  // The screen's own book: its work and its place in the series.
  workId: string | null;
  position: number | null;
  refreshKey: string;
  accent: string;
}) {
  const { colors, fonts } = useTheme();
  const row = useRef<ScrollViewInstance>(null);
  const progress = track.started ? progressLabel(track) : null;

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.heading}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" accessibilityRole="header">In this series</Text>
          <Text variant="small" numberOfLines={2}>
            {track.name}{progress ? ` · ${track.finished ? "All read" : progress}` : ""}
          </Text>
        </View>
        <FollowSeries name={track.name} author={track.author} following={track.following} refreshKey={refreshKey} quiet />
      </View>
      <ScrollView ref={row} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: GAP, paddingVertical: 3, paddingHorizontal: 3 }}>
        {track.entries.map((entry) => {
          const isHere = isPageBook(entry, { workId, position });
          const state = entryState(entry, track, isHere);
          const place = positionLabel(entry.position);
          return (
            <Pressable
              key={entry.workId}
              disabled={isHere}
              onPress={() => openEntry(entry)}
              onLayout={isHere ? (e) => row.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 3), animated: false }) : undefined}
              accessibilityRole={isHere ? undefined : "button"}
              accessibilityLabel={[place, entry.title, state, !isHere && !entry.bookId ? "Add it" : null].filter(Boolean).join(", ")}
              style={{ width: COVER, gap: 4 }}
            >
              <BookCover
                book={{ title: entry.title, author: entry.author, coverImage: entry.coverUrl }}
                width={COVER}
                fallbackColour={accent}
                style={isHere ? { borderWidth: 2, borderColor: colors.foreground } : undefined}
              />
              {place ? <Text variant="small">{place}</Text> : null}
              <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 18, fontFamily: fonts.sansMedium }}>{entry.title}</Text>
              {state ? <Text variant="small" style={isHere || state === "Up next" ? { color: colors.foreground } : undefined}>{state}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {!track.started && !track.following && (
        <Text variant="muted">Follow it to keep it in your series tracker before you{"’"}ve started.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
});
