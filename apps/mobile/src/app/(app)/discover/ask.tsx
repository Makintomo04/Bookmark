import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import useSWR from "swr";
import { AlertTriangle, BookCheck, Star, UsersRound } from "lucide-react-native";
import { FEATURE_COPY, isUpgradeRequired } from "@bookmark/shared/entitlements";
import { MOOD_LABEL, WARNING_LEVEL_LABEL, type Mood, type MoodCount, type WarningSummary } from "@bookmark/shared/workTags";
import { BookCover } from "@/components/books/BookCover";
import { Avatar } from "@/components/profile/Avatar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { AiLabel } from "@/components/ui/AiLabel";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, api } from "@/lib/api";
import { addBook } from "@/lib/discover";
import type { Person } from "@/lib/social";
import { useTheme } from "@/lib/theme";

// Ask the shelf (the web's /discover/ask): describe a read in your own words; AI turns it into a search
// of Bookmark's catalog, and books loved by people you follow come first. The rules: the reader starts
// it, the model never names a title (every book comes from the catalog), and everything it wrote is
// labelled AI.

const QUERY_MAX = 300;
const EXAMPLES = [
  "Cosy and low-stakes, after a heavy week",
  "Strong female lead, fantasy, under 400 pages, no sexual violence",
  "A slow-burn romance with a happy ending",
];

type Allowance = { available: boolean; allowance: number | null; used: number; left: number | null; isPlus: boolean; dailyLeft: number };
type Signal = { kind: "followed"; people: Person[]; rating: number } | { kind: "circle"; people: Person[]; count: number; together: boolean };
type Intent = {
  moods: Mood[];
  avoidMoods: Mood[];
  pace: string | null;
  genres: string[];
  mustHaves: string[];
  mustNotHaves: string[];
  avoidSubjects: string[];
  minPages: number | null;
  maxPages: number | null;
  format: string | null;
  rereads: boolean;
};
type Result = {
  workId: string;
  workKey: string | null;
  title: string;
  author: string;
  coverUrl: string | null;
  pages: number | null;
  moods: MoodCount[];
  warnings: WarningSummary[];
  tagReaders: number;
  signal: Signal | null;
  reason: string | null;
  strong: boolean;
  shelf: { status: string; rating: number | null } | null;
};
type Outcome = { intent: Intent; results: Result[]; reasons: "done" | "failed" | "none"; left: number | null; query: string };

const formatRating = (rating: number) => (Number.isInteger(rating) ? String(rating) : rating.toFixed(1));
const names = (people: Person[]) => people.map((p) => p.username ?? "a reader").join(", ");

const allowanceText = (s: Allowance) =>
  s.left === null ? `${s.used} searches this month`
  : s.isPlus ? `${s.left} of ${s.allowance} searches left this month (fair use)`
  : `${s.left} of ${s.allowance} free searches left this month`;

// The search as the model read it, so the reader can see what was looked for and rephrase.
function intentChips(intent: Intent): string[] {
  const chips = [...intent.moods.map((m) => MOOD_LABEL[m]), ...(intent.pace ? [`${intent.pace} pace`] : []), ...intent.genres, ...intent.mustHaves];
  if (intent.minPages && intent.maxPages) chips.push(`${intent.minPages}–${intent.maxPages} pages`);
  else if (intent.maxPages) chips.push(`under ${intent.maxPages} pages`);
  else if (intent.minPages) chips.push(`over ${intent.minPages} pages`);
  if (intent.format) chips.push(intent.format);
  for (const w of intent.mustNotHaves) chips.push(`no ${w.toLowerCase()}`);
  for (const s of intent.avoidSubjects) chips.push(`no ${s}`);
  for (const m of intent.avoidMoods) chips.push(`not ${MOOD_LABEL[m]}`);
  if (intent.rereads) chips.push("re-reads welcome");
  return chips;
}


export default function AskTheShelf() {
  const { colors } = useTheme();
  const { data: status, mutate } = useSWR<Allowance>("/api/discover/ask");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  if (!status) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (!status.available) {
    return (
      <Screen>
        <Text variant="display">Ask the shelf</Text>
        <Notice message="Search isn't available right now. Ask the shelf is switched off at the moment. Your searches this month aren't affected." />
      </Screen>
    );
  }

  const search = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3 || searching) return;
    setQuery(trimmed);
    setSearching(true);
    setError(null);
    try {
      const result = await api.post<Omit<Outcome, "query">>("/api/discover/ask", { query: trimmed });
      setOutcome({ ...result, query: trimmed });
      await mutate();
      if (!status.isPlus && result.left === 0) setUpgrade(true);
    } catch (e) {
      if (e instanceof ApiError && isUpgradeRequired(e.body)) {
        setUpgrade(true);
        await mutate();
      } else {
        setError(e instanceof ApiError ? e.message : "Search isn't available right now. Try again in a minute.");
      }
    } finally {
      setSearching(false);
    }
  };

  const outOfSearches = status.left === 0;
  const chips = outcome ? intentChips(outcome.intent) : [];
  const strong = outcome?.results.filter((r) => r.strong) ?? [];
  const weak = outcome?.results.filter((r) => !r.strong) ?? [];

  return (
    <Screen>
      <Text variant="display">Ask the shelf</Text>
      <Text variant="muted">Describe the read you{"’"}re after in your own words. AI turns it into a search of Bookmark{"’"}s catalog; books loved by people you follow come first.</Text>

      <TextField
        label="What are you in the mood for?"
        value={query}
        onChangeText={(t) => setQuery(t.slice(0, QUERY_MAX))}
        placeholder={"A mood, a trope, a length, anything you don’t want…"}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 90, paddingTop: 12 }}
        editable={!searching && !outOfSearches}
      />
      <View style={styles.examples}>
        {EXAMPLES.map((example) => <Chip key={example} label={example} selected={false} disabled={searching || outOfSearches} onPress={() => search(example)} />)}
      </View>
      <Button title={searching ? "Searching…" : "Search"} loading={searching} disabled={outOfSearches || query.trim().length < 3} onPress={() => search(query)} />
      <Text variant="small">{allowanceText(status)}</Text>
      {upgrade && <Notice message={`${FEATURE_COPY.askShelfSearches.title}. ${FEATURE_COPY.askShelfSearches.message}`} />}
      {error && <Notice tone="error" message={error} />}

      {outcome && (
        <View style={{ gap: 16 }}>
          {chips.length > 0 && (
            <View style={{ gap: 6 }}>
              <View style={styles.row}><AiLabel /><Text variant="small">What we looked for</Text></View>
              <View style={styles.examples}>{chips.map((c) => <Chip key={c} label={c} selected={false} disabled />)}</View>
            </View>
          )}
          {outcome.results.length === 0 ? (
            <Text variant="muted">
              {chips.length === 0 ? "That didn't read as a book request. Describe a mood, a genre or a trope and try again." : "No book in Bookmark's catalog matches all of that yet. Try fewer conditions, or a different way of putting it."}
            </Text>
          ) : (
            <>
              {strong.map((r) => <ResultCard key={r.workId} result={r} />)}
              {weak.length > 0 && <Text variant="label">{weak.length === outcome.results.length ? "Nothing fits all of that, so these are the closest" : "Closer to some of it than all of it"}</Text>}
              {weak.map((r) => <ResultCard key={r.workId} result={r} />)}
              {outcome.reasons === "failed" && <Text variant="small">The short summaries couldn{"’"}t be written this time. The books are the same.</Text>}
              <Text variant="small">Every book here is in Bookmark{"’"}s catalog; {outcome.intent.rereads ? "books you’ve read are included" : "books on your shelf are left out"}. Lines marked AI are written by AI from each book{"’"}s description and readers{"’"} tags.</Text>
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

function ResultCard({ result }: { result: Result }) {
  const { colors, radii } = useTheme();
  const [showWarnings, setShowWarnings] = useState(false);
  return (
    <View style={[styles.card, { borderRadius: radii.lg, borderColor: colors.border }]}>
      <View style={styles.row}>
        <BookCover book={{ title: result.title, author: result.author, coverImage: result.coverUrl }} width={64} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 16 }} numberOfLines={2}>{result.title}</Text>
          <Text variant="muted" numberOfLines={1}>{result.author}{result.pages ? ` · ${result.pages} pages` : ""}</Text>
          {result.shelf && (
            <View style={styles.row}><BookCheck size={12} color={colors.mutedForeground} /><Text variant="small">{result.shelf.status === "COMPLETED" && result.shelf.rating ? `You rated it ${formatRating(result.shelf.rating)}` : "On your shelf"}</Text></View>
          )}
          {result.signal && (
            <View style={styles.row}>
              {result.signal.kind === "followed" ? <Star size={12} color={colors.mutedForeground} /> : <UsersRound size={12} color={colors.mutedForeground} />}
              {result.signal.people.slice(0, 3).map((p, i) => <Avatar key={i} image={p.image} name={p.username} colour={p.favColour} size={16} />)}
              <Text variant="small" style={{ flex: 1 }} numberOfLines={2}>
                {result.signal.kind === "followed"
                  ? `Rated ${formatRating(result.signal.rating)} by ${names(result.signal.people)}`
                  : result.signal.together && result.signal.count === 0 ? "Read in one of your circles"
                  : `Finished by ${names(result.signal.people)}${result.signal.count > result.signal.people.length ? ` and ${result.signal.count - result.signal.people.length} more` : ""} in your circles`}
              </Text>
            </View>
          )}
        </View>
      </View>
      {result.reason && (
        <View style={[styles.reason, { borderRadius: radii.md, backgroundColor: colors.muted }]}>
          <AiLabel />
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{result.reason}</Text>
        </View>
      )}
      {result.moods.length > 0 && (
        <View style={styles.examples}>{result.moods.map((m) => <Chip key={m.mood} label={MOOD_LABEL[m.mood]} selected={false} disabled />)}</View>
      )}
      {result.warnings.length === 0 ? (
        <Text variant="small">{result.tagReaders > 0 ? "No content warnings reported" : "No reader tags yet"}</Text>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setShowWarnings(!showWarnings)} style={{ gap: 4 }}>
          <View style={styles.row}><AlertTriangle size={12} color={colors.mutedForeground} /><Text variant="small">{showWarnings ? "Hide content warnings" : `Content warnings (${result.warnings.length})`}</Text></View>
          {showWarnings && result.warnings.map((w) => <Text key={w.topic} variant="small">{w.topic} ({WARNING_LEVEL_LABEL[w.level]})</Text>)}
        </Pressable>
      )}
      <View style={{ alignItems: "flex-start" }}>
        <Button title="Add to my shelf" variant="ghost" onPress={() => addBook(result)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  examples: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  card: { borderWidth: 1, padding: 12, gap: 10 },
  reason: { flexDirection: "row", gap: 8, padding: 10, alignItems: "flex-start" },
});
