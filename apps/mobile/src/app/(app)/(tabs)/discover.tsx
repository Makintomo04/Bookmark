import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { readerName } from "@bookmark/shared/profile";
import { router } from "expo-router";
import useSWR from "swr";
import { ArrowRight, Compass, ListOrdered, Search, Feather, Star, UserRound } from "lucide-react-native";
import { genreBySlug } from "@bookmark/shared/genres";
import { formatReleaseDate } from "@bookmark/shared/releases";
import { BookCover } from "@/components/books/BookCover";
import { GenrePicks } from "@/components/discover/GenrePicks";
import { ListCard } from "@/components/discover/ListCard";
import { Avatar } from "@/components/profile/Avatar";
import { StaffSeal } from "@/components/profile/StaffSeal";
import { AiLabel } from "@/components/ui/AiLabel";
import { AppBar } from "@/components/ui/AppBar";
import { Button } from "@/components/ui/Button";
import { SectionHeading, cardStyle } from "@/components/ui/Section";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { openOrAdd, tileAction, useOnShelf, type DiscoverHome, type FollowingPick, type ListSummary, type ShelfCopy } from "@/lib/discover";
import { useTheme } from "@/lib/theme";

// Discover (the web's /discover): searching, Ask the shelf, the spotlight list, genres (your favourites
// first) and what's popular in them, books on the way, what people you follow listed or loved, Bookmark's
// picks and readers' lists.
export default function Discover() {
  const { colors, radii } = useTheme();
  const { data, error, isLoading, mutate } = useSWR<DiscoverHome>("/api/discover");
  const pickOnShelf = useOnShelf(data?.following.picks.map((p) => p.book));

  return (
    <Screen>
      <AppBar />
      <View style={{ gap: 6 }}>
        <Text variant="display" accessibilityRole="header">Discover</Text>
        <Text variant="muted">Find your next read, and the readers behind it.</Text>
      </View>
      <View style={styles.searchRow}>
        <SearchButton icon={Search} label="Find a book" onPress={() => router.push("/add-book")} />
        <SearchButton icon={UserRound} label="Find readers" onPress={() => router.push("/search")} />
      </View>

      {/* The first-book picker (BOO-52), for anyone stuck on what to read next. No AI, so it comes first. */}
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push("/first-book")}
        style={({ pressed }) => [styles.ask, cardStyle(colors, radii.lg, pressed, colors.muted)]}
      >
        <View style={[styles.badge, { backgroundColor: colors.muted }]}><Compass size={20} strokeWidth={1.75} color={colors.brandText} /></View>
        <View style={{ flex: 1 }}>
          <Text variant="title">Help me pick a book</Text>
          <Text variant="muted">From your Want to read, what people you follow loved, the team{"’"}s picks and your genres.</Text>
        </View>
        <ArrowRight size={18} color={colors.mutedForeground} />
      </Pressable>

      {/* The way into Ask the shelf: a search the reader starts, never a feed of AI picks. */}
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push("/discover/ask")}
        style={({ pressed }) => [styles.ask, cardStyle(colors, radii.lg, pressed, colors.muted)]}
      >
        <View style={[styles.badge, { backgroundColor: colors.muted }]}><Feather size={20} strokeWidth={1.75} color={colors.brandText} /></View>
        <View style={{ flex: 1 }}>
          <View style={styles.askTitle}><Text variant="title">Ask the shelf</Text><AiLabel /></View>
          <Text variant="muted">Describe the read you{"’"}re in the mood for, in your own words.</Text>
        </View>
        <ArrowRight size={18} color={colors.mutedForeground} />
      </Pressable>

      {isLoading && <ActivityIndicator color={colors.mutedForeground} />}
      {error && (
        <View style={{ gap: 8 }}>
          <Notice tone="error" message="We couldn't load Discover. Check your connection." />
          <Button title="Try again" variant="outline" onPress={() => mutate()} />
        </View>
      )}
      {data && (
        <>
          {data.featured && <Spotlight list={data.featured} />}
          <Section title="Browse by genre">
            <View style={styles.grid}>
              {data.genres.map((genre) => (
                <Pressable
                  key={genre.slug}
                  accessibilityRole="link"
                  onPress={() => router.push(`/discover/genre/${genre.slug}`)}
                  style={({ pressed }) => [styles.tile, { borderRadius: radii.lg, backgroundColor: genreBySlug(genre.slug)?.colour ?? colors.muted, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text variant="title" style={{ color: "#ffffff" }}>{genre.label}</Text>
                </Pressable>
              ))}
            </View>
          </Section>
          <GenrePicks placement="discover" />
          <UpcomingRow />
          {data.following.picks.length > 0 && (
            <Section title="From people you follow">
              <FlatList horizontal data={data.following.picks} keyExtractor={(p) => p.key} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} extraData={pickOnShelf} renderItem={({ item, index }) => <PickCard pick={item} copy={pickOnShelf(index)} />} />
            </Section>
          )}
          <ListRow title="Bookmark picks" lists={data.picks} />
          <ListRow title="Readers' lists" lists={data.community} />
        </>
      )}
    </Screen>
  );
}

function SearchButton({ icon: Icon, label, onPress }: { icon: typeof Search; label: string; onPress: () => void }) {
  const { colors, radii } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.searchButton, { borderColor: colors.input, backgroundColor: pressed ? colors.muted : "transparent" }]}>
      <Icon size={16} color={colors.mutedForeground} />
      <Text variant="muted">{label}</Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12, marginTop: 8 }}>
      <SectionHeading title={title} />
      {children}
    </View>
  );
}

function ListRow({ title, lists }: { title: string; lists: ListSummary[] }) {
  if (lists.length === 0) return null;
  return (
    <Section title={title}>
      <FlatList horizontal data={lists} keyExtractor={(l) => l.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} renderItem={({ item }) => <ListCard list={item} />} />
    </Section>
  );
}

function Spotlight({ list }: { list: ListSummary }) {
  const { colors, radii } = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/lists/${list.id}`)} style={[styles.spotlight, { borderRadius: radii.lg, backgroundColor: colors.brandFill }]}>
      {list.featuredLabel ? <Text variant="small" style={styles.spotlightLabel}>{list.featuredLabel.toUpperCase()}</Text> : null}
      <Text variant="display" style={{ color: "#ffffff" }}>{list.title}</Text>
      {list.description ? <Text numberOfLines={3} style={{ color: "rgba(255,255,255,0.8)" }}>{list.description}</Text> : null}
      <View style={styles.spotlightCovers}>
        {list.items.slice(0, 4).map((item, i) => <BookCover key={i} book={{ title: item.title, author: item.author, coverImage: item.coverUrl }} width={56} />)}
      </View>
      <Text style={{ color: "#ffffff" }}>See all {list.itemCount} books</Text>
    </Pressable>
  );
}

interface UpcomingBook {
  workKey: string | null;
  pageWorkId: string | null;
  title: string;
  author: string;
  coverUrl: string | null;
  releaseDate: string;
  followed: boolean;
}

// Upcoming (the web's Discover row): books not out yet, soonest first, followed authors and series first.
// Pressing one adds it, so it's on Want to read for the morning it comes out.
function UpcomingRow() {
  const { colors, radii } = useTheme();
  const { data } = useSWR<{ books: UpcomingBook[] }>("/api/discover/upcoming?limit=12");
  const onShelf = useOnShelf(data?.books);
  if (!data?.books.length) return null;
  return (
    <Section title="Upcoming">
      <FlatList
        horizontal
        data={data.books}
        keyExtractor={(b) => b.pageWorkId ?? b.workKey ?? b.title}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12 }}
        extraData={onShelf}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title} by ${item.author}, out ${formatReleaseDate(item.releaseDate)}. ${tileAction(onShelf(index))}`}
            onPress={() => openOrAdd(item, onShelf(index))}
            style={({ pressed }) => [styles.pick, cardStyle(colors, radii.lg, pressed, colors.muted)]}
          >
            <BookCover book={{ title: item.title, author: item.author, coverImage: item.coverUrl ?? "" }} width={96} />
            <Text numberOfLines={2} style={{ fontSize: 14 }}>{item.title}</Text>
            <Text variant="small" numberOfLines={1}>{item.author}</Text>
            <Text variant="small" numberOfLines={1}>{formatReleaseDate(item.releaseDate)}{onShelf(index) ? " · On your shelf" : item.followed ? " · You follow this" : ""}</Text>
          </Pressable>
        )}
      />
    </Section>
  );
}

function PickCard({ pick, copy }: { pick: FollowingPick; copy: ShelfCopy }) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pick.book.title} by ${pick.book.author}, picked by ${readerName(pick.person) || "a reader"}. ${tileAction(copy)}`}
      onPress={() => openOrAdd(pick.book, copy)}
      style={({ pressed }) => [styles.pick, cardStyle(colors, radii.lg, pressed, colors.muted)]}
    >
      <BookCover book={{ title: pick.book.title, author: pick.book.author, coverImage: pick.book.coverUrl }} width={96} />
      <Text numberOfLines={2} style={{ fontSize: 14 }}>{pick.book.title}</Text>
      <View style={styles.pickWho}>
        <Avatar image={pick.person.image} name={pick.person.username} colour={pick.person.favColour} size={16} />
        {/* The card is pressable, so the seal only marks the role. */}
        {pick.person.staffBadge ? <StaffSeal kind={pick.person.staffBadge} size={14} pressable={false} /> : null}
        {pick.list ? <ListOrdered size={12} color={colors.mutedForeground} /> : <Star size={12} color={colors.mutedForeground} />}
        <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>{pick.list ? pick.list.title : `Rated ${pick.rating ?? ""}`}</Text>
      </View>
      {pick.reason ? <Text variant="small" numberOfLines={3} style={{ fontStyle: "italic" }}>{"“"}{pick.reason}{"”"}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: "row", gap: 10 },
  searchButton: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 46, paddingHorizontal: 16, borderWidth: 1, borderRadius: 999 },
  ask: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  askTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48%", flexGrow: 1, minHeight: 88, padding: 14, justifyContent: "flex-end" },
  spotlight: { padding: 18, gap: 10 },
  spotlightLabel: { color: "rgba(255,255,255,0.75)", letterSpacing: 1.5 },
  spotlightCovers: { flexDirection: "row", gap: 8 },
  pick: { width: 132, padding: 10, gap: 6 },
  pickWho: { flexDirection: "row", alignItems: "center", gap: 4 },
});
