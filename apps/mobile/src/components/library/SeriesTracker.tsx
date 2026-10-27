import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import { positionLabel, progressLabel, trackerGroups, type SeriesEntry, type SeriesTrack } from "@bookmark/shared/series";
import { BookCover } from "@/components/books/BookCover";
import { Segmented } from "@/components/ui/Segmented";
import { Text } from "@/components/ui/Text";
import { useBooks } from "@/lib/books";
import { addBook } from "@/lib/discover";
import { SERIES_TRACKER_KEY, type SeriesTracker as Tracker } from "@/lib/series";
import { useTheme } from "@/lib/theme";

type Tab = "nextUp" | "started" | "unfinished";

const EMPTY: Record<Tab, string> = {
  nextUp: "Nothing next yet. Finish a book in a series, or follow one from a book.",
  started: "Start a book in a series and it’ll show here.",
  unfinished: "You’ve finished every series you’ve started.",
};

// A book on your shelf opens there; one that isn't goes to Add a book.
const openEntry = (entry: SeriesEntry) =>
  entry.bookId ? router.push(`/book/${entry.bookId}`) : addBook({ title: entry.title, author: entry.author, coverUrl: entry.coverUrl, workKey: entry.workKey });

// The series tracker on the Library tab (the web's SeriesTracker): the next book in each series, the
// series you've started, and the ones you haven't finished.
export function SeriesTracker({ accent }: { accent: string }) {
  const { data, mutate } = useSWR<Tracker>(SERIES_TRACKER_KEY);
  const { data: books } = useBooks();
  const [tab, setTab] = useState<Tab>("nextUp");
  // A book moved between shelves changes what's next.
  useEffect(() => { if (books) void mutate(); }, [books, mutate]);
  if (!data) return null;
  const groups = trackerGroups(data.series);
  const shown = groups[tab];

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.heading} accessibilityRole="header">
        <Text variant="title">Series</Text>
        <Text variant="muted">{data.series.length}</Text>
      </View>
      {data.series.length === 0 ? (
        <Text variant="muted">Start a book in a series, or follow one from a book, and you{"’"}ll see what{"’"}s next here.</Text>
      ) : (
        <>
          <Segmented
            value={tab}
            onChange={setTab}
            label="Show"
            options={[
              { value: "nextUp", label: `Next up ${groups.nextUp.length}` },
              { value: "started", label: `Started ${groups.started.length}` },
              { value: "unfinished", label: `Not finished ${groups.unfinished.length}` },
            ]}
          />
          {shown.length === 0 ? (
            <Text variant="muted">{EMPTY[tab]}</Text>
          ) : tab === "nextUp" ? (
            <FlatList
              horizontal
              data={shown}
              keyExtractor={(t) => t.key}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
              renderItem={({ item }) => <NextCard track={item} accent={accent} />}
            />
          ) : (
            <View style={{ gap: 16 }}>{shown.map((t) => <SeriesRow key={t.key} track={t} />)}</View>
          )}
        </>
      )}
    </View>
  );
}

function NextCard({ track, accent }: { track: SeriesTrack; accent: string }) {
  const entry = track.next!;
  const where = [positionLabel(entry.position), track.name].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.title}, ${where}${entry.status === "STARTED" ? ", reading now" : entry.bookId ? "" : ". Add it."}`}
      onPress={() => openEntry(entry)}
      style={{ width: 112, gap: 4 }}
    >
      <BookCover book={{ title: entry.title, author: entry.author, coverImage: entry.coverUrl }} width={112} fallbackColour={accent} />
      <Text variant="small" numberOfLines={1}>{where}</Text>
      <Text numberOfLines={2} style={{ fontSize: 14 }}>{entry.title}</Text>
      {entry.status === "STARTED" && <Text variant="small">Reading now</Text>}
    </Pressable>
  );
}

function SeriesRow({ track }: { track: SeriesTrack }) {
  const { colors } = useTheme();
  const progress = progressLabel(track);
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.rowTop}>
        <Text style={{ flex: 1, fontSize: 16 }} numberOfLines={2}>{track.name} <Text variant="muted">by {track.author}</Text></Text>
        {progress ? <Text variant="small">{track.finished ? "All read" : progress}</Text> : null}
      </View>
      <View style={styles.marks} accessible accessibilityLabel={progress ?? undefined}>
        {track.entries.map((e) => (
          <View
            key={e.workId}
            style={[
              styles.mark,
              e.position !== null && !Number.isInteger(e.position) && { width: 12 },
              { backgroundColor: e.read ? colors.foreground : e.status === "STARTED" ? colors.mutedForeground : colors.muted },
            ]}
          />
        ))}
      </View>
      {track.next && (
        <Pressable accessibilityRole="button" onPress={() => openEntry(track.next!)}>
          <Text variant="muted">
            {track.next.status === "STARTED" ? "Reading" : "Next"}: <Text>{track.next.title}</Text>
            {track.next.position !== null ? ` (${positionLabel(track.next.position)})` : ""}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  rowTop: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  marks: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  mark: { width: 24, height: 8, borderRadius: 4 },
});
