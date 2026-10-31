import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { ArrowUpDown, Check, ChevronDown, Search, X } from "lucide-react-native";
import { DEFAULT_COLOUR, readerName } from "@bookmark/shared/profile";
import { ratingGlyphs } from "@bookmark/shared/rating";
import {
  EMPTY_FILTER, FORMAT_LABEL, SHELF_SORTS, SHELF_STATUS, SHELF_TITLE, SORT_LABEL, isNarrowed, parseShelfParams, shelfOf,
  type ShelfFilter, type ShelfKey,
} from "@bookmark/shared/shelfFilter";
import { BookCover } from "@/components/books/BookCover";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { shelfPageKey, type Book, type ShelfOptions, type ShelfPage } from "@/lib/books";
import { useTheme } from "@/lib/theme";

// One shelf (/shelf/finished), or every shelf (/shelf/all), as a grid: the Library tab's See all and its
// search. The server searches, sorts and filters (GET /api/books?take=…, lib/shelfFilter.ts's rules), and
// the grid loads 60 books at a time as it scrolls, so a shelf of thousands opens as fast as one of ten.
// Filters can arrive in the link too (/shelf/finished?year=2024), as the web's shelf pages take them.
// With ?reader=<username> it's another reader's Finished or Want to read instead (their profile's See all), from
// /api/users/<username>/shelf by the same rules: read-only, as their profile shows it to you.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHELVES = Object.keys(SHELF_STATUS) as ShelfKey[];
const GAP = 12;
const GUTTER = 16;
const count = (n: number) => n.toLocaleString("en-GB");
const isShelf = (v: string | undefined): v is ShelfKey => !!v && (SHELVES as string[]).includes(v);

interface Option { value: string; label: string }
// The picker open over the grid: its title, choices and what picking one does.
interface Picker { title: string; value: string; options: Option[]; onPick: (value: string) => void }

export default function ShelfScreen() {
  const params = useLocalSearchParams<Record<string, string>>();
  const { colors, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const { data: user } = useSWR<{ favColour: string | null }>("/api/user");
  // Someone else's shelf: only Finished and Want to read, the two their profile shows.
  const reader = typeof params.reader === "string" && params.reader ? params.reader : null;
  const { data: owner } = useSWR<{ username: string; displayName?: string | null; favColour: string | null }>(reader ? `/api/users/${encodeURIComponent(reader)}?books=0` : null);
  const accent = (reader ? owner?.favColour : user?.favColour) || DEFAULT_COLOUR;
  // "all" is every shelf; the shelf pill can then narrow it to one. Another reader's is always one shelf.
  const everyShelf = !reader && !isShelf(params.shelf);

  const [filter, setFilter] = useState<ShelfFilter>(() => ({
    ...parseShelfParams({ get: (name) => (name === "shelf" ? null : typeof params[name] === "string" ? params[name] : null) }),
    shelf: isShelf(params.shelf) ? params.shelf : reader ? "finished" : null,
  }));
  const set = (patch: Partial<ShelfFilter>) => setFilter((f) => ({ ...f, ...patch }));
  // What's typed, sent once typing pauses.
  const [query, setQuery] = useState(filter.q);
  useEffect(() => {
    const timer = setTimeout(() => setFilter((f) => (f.q === query ? f : { ...f, q: query })), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<ShelfPage>(shelfPageKey(filter, reader));
  // A new search starts from an empty first page: keep showing the last results (and menus) until it lands,
  // so the grid doesn't blank between keystrokes.
  const last = useRef<{ pages: ShelfPage[]; options: ShelfOptions | null; counts: ShelfPage["counts"] | null }>({ pages: [], options: null, counts: null });
  if (data) last.current.pages = data;
  if (data?.[0]?.options) last.current.options = data[0].options;
  if (data?.[0]?.counts) last.current.counts = data[0].counts;
  const pages = data ?? last.current.pages;
  const options = last.current.options;
  const counts = last.current.counts;
  const books = pages.flatMap((p) => p.books);
  const total = pages[0]?.total;
  const more = !!pages[pages.length - 1]?.nextCursor;
  const loadingMore = isValidating && !!data && size > data.length;

  // A book changed on its own page: refreshAfterBookChange can't reach an infinite list, so look again on return.
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (seen.current && !reader) void mutate();
    seen.current = true;
  }, [mutate, reader]));

  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try { await mutate(); } finally { setRefreshing(false); }
  };

  const [picker, setPicker] = useState<Picker | null>(null);
  const narrowed = isNarrowed(filter);
  const clear = () => { setQuery(""); setFilter({ ...EMPTY_FILTER, sort: filter.sort, shelf: everyShelf ? null : filter.shelf }); };

  // Three covers across a phone, more on a tablet; the content keeps to the Library's width.
  const columns = width >= 700 ? 5 : width >= 520 ? 4 : 3;
  const inner = Math.min(width, 720) - GUTTER * 2;
  const coverWidth = Math.floor((inner - GAP * (columns - 1)) / columns);

  const shelfTitle = everyShelf ? "Your shelves" : SHELF_TITLE[filter.shelf!];
  const title = reader ? (owner ? `${readerName(owner)}: ${shelfTitle}` : shelfTitle) : shelfTitle;
  const any = (label: string): Option => ({ value: "", label });
  const by = options && options.tags.length > 0 ? "title, author or tag" : "title or author";

  const pills = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} keyboardShouldPersistTaps="handled">
      <Pill
        label={SORT_LABEL[filter.sort]}
        accessibilityLabel={`Sort: ${SORT_LABEL[filter.sort]}`}
        icon={<ArrowUpDown size={15} color={colors.foreground} />}
        onPress={() => setPicker({ title: "Sort", value: filter.sort, options: SHELF_SORTS.map((s) => ({ value: s, label: SORT_LABEL[s] })), onPick: (v) => set({ sort: v as ShelfFilter["sort"] }) })}
      />
      {everyShelf && (
        <Pill
          label={filter.shelf ? SHELF_TITLE[filter.shelf] : "Every shelf"}
          accessibilityLabel={`Shelf: ${filter.shelf ? SHELF_TITLE[filter.shelf] : "every shelf"}`}
          active={!!filter.shelf}
          onPress={() => setPicker({
            title: "Shelf",
            value: filter.shelf ?? "",
            options: [any("Every shelf"), ...SHELVES.filter((k) => !counts || counts[k] > 0).map((k) => ({ value: k, label: counts ? `${SHELF_TITLE[k]} · ${count(counts[k])}` : SHELF_TITLE[k] }))],
            // Each shelf has its own menus, so filters from another shelf go.
            onPick: (v) => set({ shelf: (v || null) as ShelfKey | null, year: null, month: null, genre: null, rating: null, format: null, tag: null }),
          })}
        />
      )}
      {options && options.years.length > 0 && (
        <Pill
          label={filter.year ? `Finished in ${filter.year}` : "Year finished"}
          active={!!filter.year}
          onPress={() => setPicker({ title: "Year finished", value: filter.year ? String(filter.year) : "", options: [any("Any year"), ...options.years.map((y) => ({ value: String(y), label: `Finished in ${y}` }))], onPick: (v) => set({ year: v ? Number(v) : null, month: null }) })}
        />
      )}
      {filter.year && (
        <Pill
          label={filter.month ? MONTHS[filter.month - 1] : "Month finished"}
          active={!!filter.month}
          onPress={() => setPicker({ title: "Month finished", value: filter.month ? String(filter.month) : "", options: [any("Any month"), ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))], onPick: (v) => set({ month: v ? Number(v) : null }) })}
        />
      )}
      {options && options.genres.length > 0 && (
        <Pill
          label={filter.genre ?? "Genre"}
          active={!!filter.genre}
          onPress={() => setPicker({ title: "Genre", value: filter.genre ?? "", options: [any("Any genre"), ...options.genres.map((g) => ({ value: g, label: g }))], onPick: (v) => set({ genre: v || null }) })}
        />
      )}
      {options && (options.ratings.length > 0 || options.unrated) && (
        <Pill
          label={filter.rating === null ? "Rating" : filter.rating === "unrated" ? "Not rated" : `${ratingGlyphs(filter.rating)} ${filter.rating === 1 ? "star" : "stars"}`}
          active={filter.rating !== null}
          onPress={() => setPicker({
            title: "Rating",
            value: filter.rating === null ? "" : String(filter.rating),
            options: [
              any("Any rating"),
              ...options.ratings.map((r) => ({ value: String(r), label: `${ratingGlyphs(r)} ${r === 1 ? "star" : "stars"}` })),
              ...(options.unrated ? [{ value: "unrated", label: "Not rated" }] : []),
            ],
            onPick: (v) => set({ rating: v === "" ? null : v === "unrated" ? "unrated" : Number(v) }),
          })}
        />
      )}
      {options && options.formats.length > 0 && (
        <Pill
          label={filter.format ? FORMAT_LABEL[filter.format] : "Format"}
          active={!!filter.format}
          onPress={() => setPicker({ title: "Format", value: filter.format ?? "", options: [any("Any format"), ...options.formats.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))], onPick: (v) => set({ format: (v || null) as ShelfFilter["format"] }) })}
        />
      )}
      {options && options.tags.length > 0 && (
        <Pill
          label={filter.tag ?? "Tag"}
          active={!!filter.tag}
          onPress={() => setPicker({ title: "Tag", value: filter.tag ?? "", options: [any("Any tag"), ...options.tags.map((t) => ({ value: t, label: t }))], onPick: (v) => set({ tag: v || null }) })}
        />
      )}
      {/* Set from a link (stats' top authors): shown so it can be taken off. */}
      {filter.author && <Pill label={filter.author} accessibilityLabel={`Remove author filter: ${filter.author}`} active removable onPress={() => set({ author: null })} />}
    </ScrollView>
  );

  const header = (
    <View style={{ gap: 12 }}>
      <View style={[styles.search, { borderColor: colors.input }]}>
        <Search size={16} color={colors.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={everyShelf ? `Search your shelves by ${by}` : `Search ${shelfTitle} by ${by}`}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={reader ? `Search ${shelfTitle}` : "Search your shelves"}
          autoFocus={everyShelf && !narrowed}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="never"
          style={[styles.searchInput, { color: colors.foreground, fontFamily: fonts.sans, outlineWidth: 0 }]}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery("")} hitSlop={8}>
            <X size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {pills}
      <View style={styles.countRow}>
        {total !== undefined ? (
          <Text variant="muted" accessibilityLiveRegion="polite">
            {narrowed ? (total === 1 ? "1 book matches" : `${count(total)} books match`) : total === 1 ? "1 book" : `${count(total)} books`}
          </Text>
        ) : <View />}
        {(narrowed || (everyShelf && filter.shelf)) && (
          <Pressable accessibilityRole="button" onPress={clear} hitSlop={8}>
            <Text variant="small" style={{ textDecorationLine: "underline" }}>Clear filters</Text>
          </Pressable>
        )}
      </View>
      {error && !data && (
        <View style={{ gap: 8 }}>
          <Notice tone="error" message="We couldn't load this shelf. Check your connection." />
          <Button title="Try again" variant="outline" onPress={() => mutate()} />
        </View>
      )}
    </View>
  );

  const empty = isLoading && pages.length === 0 ? (
    <ActivityIndicator color={colors.mutedForeground} />
  ) : total === 0 ? (
    <View style={{ gap: 8, alignItems: "flex-start" }}>
      <Text variant="title">{narrowed ? "No matches" : everyShelf ? "Your shelves are empty" : "Nothing on this shelf"}</Text>
      <Text variant="muted">{narrowed ? `Nothing on ${reader ? "this" : "your"} shelf matches that. Try fewer words, or clear the filters.` : reader ? "Nothing they've shared here yet." : "Books you add will show up here."}</Text>
      {narrowed && <Button title="Clear search and filters" variant="outline" onPress={clear} />}
    </View>
  ) : undefined;

  return (
    <SafeAreaView edges={["left", "right"]} style={[styles.fill, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title }} />
      <FlatList
        key={`columns-${columns}`}
        data={books}
        keyExtractor={(b) => b.id}
        numColumns={columns}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={[styles.content, { gap: 20 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.mutedForeground} /> : undefined}
        initialNumToRender={18}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        onEndReachedThreshold={0.6}
        onEndReached={() => { if (more && !isValidating) void setSize(size + 1); }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.mutedForeground} />}
        renderItem={({ item }) => <Tile book={item} width={coverWidth} accent={accent} showShelf={everyShelf && !filter.shelf} readOnly={!!reader} />}
      />
      {picker && (
        <Sheet title={picker.title} onClose={() => setPicker(null)}>
          {picker.options.map((o) => {
            const on = o.value === picker.value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => { picker.onPick(o.value); setPicker(null); }}
                style={({ pressed }) => [styles.option, { borderBottomColor: colors.border, backgroundColor: pressed ? colors.muted : "transparent" }]}
              >
                <Text style={{ flex: 1, fontFamily: on ? fonts.sansSemibold : fonts.sans }}>{o.label}</Text>
                {on && <Check size={18} color={colors.foreground} />}
              </Pressable>
            );
          })}
        </Sheet>
      )}
    </SafeAreaView>
  );
}

// A cover and its title; searching every shelf, the shelf it's on as well. Another reader's books don't open
// (book pages are for your own copies), as on their profile.
function Tile({ book, width, accent, showShelf, readOnly }: { book: Book; width: number; accent: string; showShelf: boolean; readOnly: boolean }) {
  const shelf = SHELF_TITLE[shelfOf(book.status)];
  if (readOnly) {
    return (
      <View style={{ width, gap: 6 }} accessible accessibilityLabel={`${book.title} by ${book.author}`}>
        <BookCover book={book} width={width} fallbackColour={accent} />
        <Text variant="small" numberOfLines={2}>{book.title}</Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${book.title} by ${book.author}${showShelf ? `, ${shelf}` : ""}`}
      onPress={() => router.push(`/book/${book.id}`)}
      style={{ width, gap: 6 }}
    >
      <BookCover book={book} width={width} fallbackColour={accent} />
      <Text variant="small" numberOfLines={2}>{book.title}</Text>
      {showShelf && <Text variant="small" numberOfLines={1}>{shelf}</Text>}
    </Pressable>
  );
}

// A sort or filter, as the web's pills: filled once something is chosen. Tapping opens its choices in a sheet,
// or, for a removable one, takes it off.
function Pill({ label, accessibilityLabel, active = false, removable = false, icon, onPress }: {
  label: string; accessibilityLabel?: string; active?: boolean; removable?: boolean; icon?: React.ReactNode; onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  const ink = active ? colors.background : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        active
          ? { backgroundColor: colors.foreground, borderColor: colors.foreground, opacity: pressed ? 0.85 : 1 }
          : { borderColor: colors.input, backgroundColor: pressed ? colors.muted : "transparent" },
      ]}
    >
      {icon}
      <Text numberOfLines={1} style={{ maxWidth: 200, fontFamily: fonts.sansMedium, fontSize: 14, color: ink }}>{label}</Text>
      {removable ? <X size={15} color={ink} /> : <ChevronDown size={15} color={ink} style={{ opacity: 0.7 }} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: GUTTER, paddingTop: 16, paddingBottom: 40 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
  pills: { gap: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, borderRadius: 999, borderWidth: 1, paddingLeft: 14, paddingRight: 10 },
  countRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
});
