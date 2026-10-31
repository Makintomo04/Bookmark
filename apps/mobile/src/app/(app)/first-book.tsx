import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import { BookOpen, Check, ChevronRight, Compass, Feather } from "lucide-react-native";
import type { FirstBookPicks, StarterBook, StarterSection } from "@bookmark/shared/firstBook";
import { BookCover } from "@/components/books/BookCover";
import { AiLabel } from "@/components/ui/AiLabel";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { ApiError } from "@/lib/api";
import { saveBook } from "@/lib/books";
import { addBook } from "@/lib/discover";
import { useTheme } from "@/lib/theme";

// "Help me pick my first book" (the web's /first-book, BOO-52): your Want to read, what people you follow
// loved, the team's picks and what's popular in your genres (packages/shared/src/firstBook.ts). No AI;
// Ask the shelf comes after, labelled, and says it's off until they turn it on.
export default function FirstBook() {
  const { data, error, isLoading, mutate } = useSWR<FirstBookPicks>("/api/first-book");

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text variant="display">Help me pick a book</Text>
        <Text variant="muted">A few places to start, from what you{"’"}ve saved, the people you follow, the Bookmark team and the genres you picked.</Text>
      </View>
      {isLoading && <ActivityIndicator />}
      {error && (
        <View style={{ gap: 8 }}>
          <Notice tone="error" message="We couldn't load your suggestions. Check your connection." />
          <Button title="Try again" variant="outline" onPress={() => mutate()} />
        </View>
      )}
      {data && data.sections.length === 0 && (
        <View style={{ gap: 8 }}>
          <Text variant="title">Nothing to suggest yet</Text>
          <Text variant="muted">
            {data.hasGenres ? "Follow a few readers, or browse Discover, and books will turn up here." : "Pick a few genres you like in Settings and the most popular books in them will show here."}
          </Text>
          {!data.hasGenres && <Button title="Pick genres" variant="outline" onPress={() => router.push("/settings")} />}
        </View>
      )}
      {data?.sections.map((section) => <Section key={section.source} section={section} />)}
      {data && !data.hasGenres && data.sections.length > 0 && (
        <Pressable accessibilityRole="link" onPress={() => router.push("/settings")} hitSlop={6}>
          <Text variant="muted">Pick a few genres in Settings and the most popular books in them will show here too.</Text>
        </Pressable>
      )}
      {data && <WaysOn aiFeatures={data.aiFeatures} />}
      {data && <Button title="Go to my library" variant="outline" onPress={() => router.navigate("/")} />}
    </Screen>
  );
}

function Section({ section }: { section: StarterSection }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text variant="title" accessibilityRole="header">{section.heading}</Text>
        <Text variant="muted">{section.blurb}</Text>
      </View>
      <View style={styles.grid}>
        {section.books.map((book) => <StarterCard key={book.key} book={book} />)}
      </View>
    </View>
  );
}

// A saved book starts in one tap. Anything else opens Add a book with the book filled in, on Reading, so
// the reader can still choose Want to read there.
function StarterCard({ book }: { book: StarterBook }) {
  const { colors } = useTheme();
  const [state, setState] = useState<"idle" | "starting" | "started">("idle");
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (!book.bookId) return addBook(book, "STARTED");
    setState("starting");
    setError(null);
    try {
      await saveBook({ id: book.bookId, action: "start" });
      setState("started");
    } catch (e) {
      setState("idle");
      setError(e instanceof ApiError ? e.message : `Couldn't start ${book.title}. Try again.`);
    }
  };

  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${book.title} by ${book.author}`} onPress={() => (book.bookId ? router.push(`/book/${book.bookId}` as never) : addBook(book, "STARTED"))}>
        <BookCover book={{ title: book.title, author: book.author, coverImage: book.coverUrl }} width={CARD_WIDTH} />
      </Pressable>
      <Text variant="small" numberOfLines={2} style={{ color: colors.foreground }}>{book.title}</Text>
      <Text variant="small" numberOfLines={1}>{book.author}</Text>
      {book.why && <Text variant="small" numberOfLines={2}>{book.why}</Text>}
      {book.quote && <Text variant="small" numberOfLines={3} style={{ fontStyle: "italic" }}>{"“"}{book.quote}{"”"}</Text>}
      {state === "started" ? (
        <View style={styles.started} accessibilityLiveRegion="polite">
          <Check size={14} color={colors.brandText} />
          <Text variant="small" style={{ color: colors.brandText }}>Reading</Text>
        </View>
      ) : (
        <Button
          title={book.bookId ? (state === "starting" ? "Starting…" : "Start") : "Add"}
          variant={book.bookId ? "primary" : "outline"}
          loading={state === "starting"}
          icon={book.bookId ? <BookOpen size={14} color={colors.onBrand} /> : undefined}
          accessibilityLabel={book.bookId ? `Start reading ${book.title}` : `Add ${book.title}`}
          onPress={() => void start()}
        />
      )}
      {error && <Text variant="small" style={{ color: colors.danger }}>{error}</Text>}
    </View>
  );
}

function WaysOn({ aiFeatures }: { aiFeatures: boolean }) {
  return (
    <View style={{ gap: 10 }}>
      <Text variant="title" accessibilityRole="header">Not seeing it?</Text>
      <WayOn icon={Compass} title="Browse Discover" description="Every genre, the team's lists and readers' lists." onPress={() => router.navigate("/discover")} />
      <WayOn
        icon={Feather}
        title="Ask the shelf"
        ai
        description={`Describe what you're in the mood for and AI turns it into a search of the catalogue.${aiFeatures ? "" : " It's off until you turn it on, and nothing above needs it."}`}
        onPress={() => router.push("/discover/ask")}
      />
    </View>
  );
}

function WayOn({ icon: Icon, title, description, ai, onPress }: { icon: typeof Compass; title: string; description: string; ai?: boolean; onPress: () => void }) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}${ai ? ", uses AI" : ""}. ${description}`}
      onPress={onPress}
      style={({ pressed }) => [styles.way, { borderRadius: radii.lg, borderColor: colors.border, backgroundColor: pressed ? colors.muted : colors.card }]}
    >
      <Icon size={20} color={colors.brand} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text variant="title">{title}</Text>
          {ai && <AiLabel />}
        </View>
        <Text variant="muted">{description}</Text>
      </View>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

const CARD_WIDTH = 104;

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  card: { width: CARD_WIDTH, gap: 4 },
  started: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36 },
  way: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderWidth: 1 },
});
