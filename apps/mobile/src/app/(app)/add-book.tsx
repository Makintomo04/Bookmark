import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Switch, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Search } from "lucide-react-native";
import { formatPayload, runningTimeOf, type FormatChoice } from "@bookmark/shared/bookFormat";
import { BookCover } from "@/components/books/BookCover";
import { FormatFields } from "@/components/books/FormatFields";
import { StarRating } from "@/components/books/StarRating";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Segmented } from "@/components/ui/Segmented";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, api } from "@/lib/api";
import { goBack } from "@/lib/navigation";
import { copyCoverLater, refreshAfterBookChange } from "@/lib/books";
import { useOnShelf } from "@/lib/discover";
import { useBookSearch, type FoundBook } from "@/lib/useBookSearch";
import { useTheme } from "@/lib/theme";
import type { EarnMoment } from "@bookmark/shared/earnMoment";
import { celebrate } from "@/lib/earnMoment";

// Adding a book, after the web's BookEntryModal: search by title or author (or type it in), choose the
// shelf, add. Opened with ?shelf=STARTED to start on Reading, and ?startCircle=1 to go straight on to
// starting a reading circle with it (with &clubId=, a club's next book). Details can be corrected afterwards from the book (Edit details).

type Shelf = "NOT_STARTED" | "STARTED" | "COMPLETED";
const SHELVES: { value: Shelf; label: string }[] = [
  { value: "NOT_STARTED", label: "Want to read" },
  { value: "STARTED", label: "Reading" },
  { value: "COMPLETED", label: "Finished" },
];
const ADDED: Record<Shelf, string> = { NOT_STARTED: "Want to read", STARTED: "Reading", COMPLETED: "Finished" };
// Every shelf a copy can be on (the web's lib/shelfCopy.ts), for "Already on your shelf, in …".
const SHELF_NAMES: Record<string, string> = { STARTED: "Currently reading", PAUSED: "Paused", NOT_STARTED: "Want to read", COMPLETED: "Finished", DNF: "Did not finish", NOT_INTERESTED: "Will not read" };

type Draft = { title: string; author: string; pages: string; coverUrl: string | null; found: FoundBook | null };

export default function AddBook() {
  const params = useLocalSearchParams<{ shelf?: string; startCircle?: string; clubId?: string; title?: string; author?: string; coverUrl?: string; pages?: string; workKey?: string }>();
  const startCircle = params.startCircle === "1";
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  // Opened on a book from Discover, a list or Ask the shelf: straight to choosing the shelf.
  const [draft, setDraft] = useState<Draft | null>(() => {
    if (!params.title || !params.author) return null;
    const pages = params.pages ? parseInt(params.pages, 10) || null : null;
    const found: FoundBook = { workKey: params.workKey ?? null, title: params.title, author: params.author, pages, coverUrl: params.coverUrl ?? null };
    return { title: params.title, author: params.author, pages: pages ? String(pages) : "", coverUrl: params.coverUrl ?? null, found };
  });
  const { results, isSearching, failed } = useBookSearch(query, { attempt });
  const { colors, radii } = useTheme();

  if (draft) {
    return <ShelfStep draft={draft} setDraft={setDraft} initialShelf={(SHELVES.some((s) => s.value === params.shelf) ? params.shelf : "NOT_STARTED") as Shelf} startCircle={startCircle} clubId={params.clubId} onBack={() => setDraft(null)} />;
  }

  return (
    <Screen scroll={false}>
      <TextField
        label={startCircle ? "Which book is the circle reading?" : "Search for a book"}
        value={query}
        onChangeText={setQuery}
        placeholder="Search by title or author"
        autoFocus
        autoCorrect={false}
        returnKeyType="search"
      />
      {isSearching && <ActivityIndicator color={colors.mutedForeground} />}
      {failed && (
        <View style={{ gap: 8 }}>
          <Notice tone="error" message="Search isn't answering right now." />
          <Button title="Try again" variant="outline" onPress={() => setAttempt((n) => n + 1)} />
        </View>
      )}
      <FlatList
        data={results}
        keyExtractor={(b, i) => `${b.workKey ?? b.title}-${i}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 4, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title} by ${item.author}`}
            onPress={() => setDraft({ title: item.title, author: item.author, pages: item.pages ? String(item.pages) : "", coverUrl: item.coverUrl, found: item })}
            style={({ pressed }) => [styles.result, { borderRadius: radii.md, backgroundColor: pressed ? colors.muted : "transparent" }]}
          >
            <BookCover book={{ title: item.title, author: item.author, coverImage: item.coverUrl }} width={44} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2}>{item.title}</Text>
              <Text variant="muted" numberOfLines={1}>{item.author}{item.year ? ` · ${item.year}` : ""}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          query.trim().length >= 3 && !isSearching && !failed ? <Text variant="muted">No matches. Check the spelling, or add it yourself below.</Text>
          : query.trim().length < 3 ? <View style={styles.hint}><Search size={18} color={colors.mutedForeground} /><Text variant="muted">Type at least three letters.</Text></View>
          : undefined
        }
        ListFooterComponent={
          query.trim().length >= 3 && !isSearching ? (
            <Button title="Can't find it? Add it yourself" variant="ghost" onPress={() => setDraft({ title: query.trim(), author: "", pages: "", coverUrl: null, found: null })} />
          ) : undefined
        }
      />
    </Screen>
  );
}

function ShelfStep({ draft, setDraft, initialShelf, startCircle, clubId, onBack }: { draft: Draft; setDraft: (d: Draft) => void; initialShelf: Shelf; startCircle: boolean; clubId?: string; onBack: () => void }) {
  const [shelf, setShelf] = useState<Shelf>(startCircle && initialShelf === "COMPLETED" ? "STARTED" : initialShelf);
  const [currentPage, setCurrentPage] = useState("");
  const [rating, setRating] = useState(0);
  const [finishedThisYear, setFinishedThisYear] = useState(true);
  const [format, setFormat] = useState<FormatChoice>("PRINT");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manual = !draft.found;
  const isAudio = format === "AUDIOBOOK";
  const runningTime = runningTimeOf(hours, minutes);
  // A reading circle is for a book you're reading or about to; Finished isn't offered then.
  const shelves = startCircle ? SHELVES.filter((s) => s.value !== "COMPLETED") : SHELVES;
  // A book picked from search or a page that's already on the shelf: say so now, not after Add is turned away.
  // (One typed in by hand is checked by the server when it's added.)
  const copy = useOnShelf(draft.found ? [{ title: draft.title, author: draft.author, workKey: draft.found.workKey }] : undefined)(0);

  const add = async () => {
    if (!draft.title.trim() || !draft.author.trim()) return setError("Add the title and author.");
    if (isAudio && runningTime <= 0) return setError("Enter the audiobook's running time.");
    setSaving(true);
    setError(null);
    try {
      const saved = await api.post<{ id: string; earnMoment?: EarnMoment | null }>("/api/books", {
        title: draft.title.trim(),
        author: draft.author.trim(),
        pages: draft.pages || undefined,
        coverImgSrc: draft.coverUrl ?? "",
        workKey: draft.found?.workKey || undefined,
        editionKey: draft.found?.editionKey || undefined,
        isbn13: draft.found?.isbn13 || undefined,
        isbn10: draft.found?.isbn10 || undefined,
        status: shelf,
        ...formatPayload(format, runningTime),
        // For an audiobook the "current page" field holds minutes listened.
        currentPage: shelf === "STARTED" && !isAudio && currentPage ? parseInt(currentPage, 10) : undefined,
        currentMinute: shelf === "STARTED" && isAudio && currentPage ? parseInt(currentPage, 10) : undefined,
        finishedThisYear: shelf === "COMPLETED" ? finishedThisYear : undefined,
        rating: shelf === "COMPLETED" && rating > 0 ? rating : undefined,
      });
      await refreshAfterBookChange();
      celebrate(saved.earnMoment);
      copyCoverLater(saved?.id);
      if (startCircle && saved?.id) router.replace(`/circles/new?bookId=${saved.id}${clubId ? `&clubId=${clubId}` : ""}`);
      else goBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add that book. Try again.");
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={styles.bookRow}>
        <BookCover book={{ title: draft.title || "Untitled", author: draft.author, coverImage: draft.coverUrl }} width={88} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="title" style={{ fontSize: 20, lineHeight: 26 }}>{draft.title || "New book"}</Text>
          <Text variant="muted">{draft.author}</Text>
          {draft.pages ? <Text variant="small">{draft.pages} pages</Text> : null}
        </View>
      </View>
      {error && <Notice tone="error" message={error} />}
      {copy && !startCircle && (
        <View style={{ gap: 8 }}>
          <Notice message={SHELF_NAMES[copy.status] ? `Already on your shelf, in ${SHELF_NAMES[copy.status]}.` : "Already on your shelf."} />
          <Button title="Open your copy" variant="outline" onPress={() => router.replace(`/book/${copy.bookId}` as never)} />
        </View>
      )}
      {manual && (
        <View style={{ gap: 12 }}>
          <TextField label="Title" value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} />
          <TextField label="Author" value={draft.author} onChangeText={(author) => setDraft({ ...draft, author })} />
          <TextField label="Pages · optional" value={draft.pages} onChangeText={(pages) => setDraft({ ...draft, pages: pages.replace(/\D/g, "").slice(0, 5) })} keyboardType="number-pad" />
        </View>
      )}
      <FormatFields format={format} onFormat={setFormat} hours={hours} minutes={minutes} onHours={setHours} onMinutes={setMinutes} disabled={saving} />
      <Segmented label="Shelf" options={shelves} value={shelf} onChange={setShelf} disabled={saving} />
      {shelf === "STARTED" && (
        <TextField
          label={isAudio ? `Minutes listened · optional${runningTime ? ` (of ${runningTime})` : ""}` : `Current page · optional${draft.pages ? ` (of ${draft.pages})` : ""}`}
          value={currentPage}
          onChangeText={(t) => setCurrentPage(t.replace(/\D/g, "").slice(0, 5))}
          keyboardType="number-pad"
        />
      )}
      {shelf === "COMPLETED" && (
        <View style={{ gap: 12 }}>
          <View style={{ gap: 8 }}>
            <Text variant="label">Rating · optional</Text>
            <StarRating value={rating} onChange={setRating} />
          </View>
          <View style={styles.switchRow}>
            <Text>I finished it this year</Text>
            <Switch value={finishedThisYear} onValueChange={setFinishedThisYear} accessibilityLabel="I finished it this year" />
          </View>
        </View>
      )}
      {copy && startCircle ? (
        <Button title="Start the circle with your copy" loading={saving} onPress={() => router.replace(`/circles/new?bookId=${copy.bookId}${clubId ? `&clubId=${clubId}` : ""}`)} />
      ) : !copy ? (
        <Button title={startCircle ? "Add and start the circle" : `Add to ${ADDED[shelf]}`} loading={saving} onPress={add} />
      ) : null}
      <Button title="Back to search" variant="ghost" disabled={saving} onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  result: { flexDirection: "row", alignItems: "center", gap: 12, padding: 8 },
  hint: { flexDirection: "row", alignItems: "center", gap: 8 },
  bookRow: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
});
