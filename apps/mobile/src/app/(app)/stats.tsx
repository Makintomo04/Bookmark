import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import { BookOpen, BookOpenText, Flame, Headphones, Repeat, Ruler, Star, Undo2 } from "lucide-react-native";
import { formatPace } from "@bookmark/shared/goals";
import { DEFAULT_COLOUR } from "@bookmark/shared/profile";
import { ratingGlyphs } from "@bookmark/shared/rating";
import type { ReadingStats } from "@bookmark/shared/statsTypes";
import { MonthlyWrapCard } from "@/components/share/MonthlyWrapCard";
import { WrapCardPicker } from "@/components/share/WrapCardPicker";
import { ColumnChart, RankedBars, type Datum } from "@/components/stats/Charts";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// Your reading stats (the web's /stats): the tiles, the year and month charts, ratings, top genres and
// authors, and every year's goal. Every stat is free.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmt = (n: number) => n.toLocaleString("en-GB");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

// wrapDesigns: the Plus Wrap card designs are open to this reader.
type StatsResponse = { stats: ReadingStats; wrappedYears: number[]; accent: string | null; wrapDesigns?: boolean };

export default function Stats() {
  const { colors } = useTheme();
  const { data, error, isLoading } = useSWR<StatsResponse>("/api/stats");
  const [picked, setPicked] = useState<number | null>(null);

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (error || !data) return <Screen><Notice tone="error" message="We couldn't load your stats. Try again in a moment." /></Screen>;

  const { stats, wrappedYears } = data;
  const accent = data.accent || DEFAULT_COLOUR;
  const year = picked ?? stats.years.at(-1)?.year ?? new Date().getFullYear();

  if (stats.finishes === 0 && stats.dnf === 0) return <Screen><StatsEmpty accent={accent} /></Screen>;

  const months = stats.months[year] ?? [];
  const monthBooks: Datum[] = months.map((m, i) => ({ label: MONTHS[i].slice(0, 3), short: MONTHS[i][0], name: MONTHS[i], value: m.books, detail: `${plural(m.books, "book")} · ${plural(m.pages, "page")}` }));
  const monthPages: Datum[] = months.map((m, i) => ({ label: MONTHS[i].slice(0, 3), short: MONTHS[i][0], name: MONTHS[i], value: m.pages, detail: plural(m.pages, "page") }));
  // The last six years fit a phone's width; older years are still in the year picker.
  const recentYears = stats.years.slice(-6);
  const yearBooks: Datum[] = recentYears.map((y) => ({ label: String(y.year), short: `’${String(y.year).slice(2)}`, value: y.books, detail: `${plural(y.books, "book")} · ${plural(y.pages, "page")}` }));
  const yearPages: Datum[] = recentYears.map((y) => ({ label: String(y.year), short: `’${String(y.year).slice(2)}`, value: y.pages, detail: plural(y.pages, "page") }));
  const ratingData: Datum[] = stats.ratings.map((r) => ({ label: ratingGlyphs(r.rating), name: `${ratingGlyphs(r.rating)} ${r.rating === 1 ? "star" : "stars"}`, value: r.count, detail: plural(r.count, "book") }));
  const yearTotal = stats.years.find((y) => y.year === year);
  const icon = (Icon: typeof BookOpen) => <Icon size={16} color={accent} />;

  return (
    <Screen edges={["left", "right"]}>
      <Text variant="display">Your stats</Text>

      <View style={styles.tiles}>
        <Tile icon={icon(BookOpen)} label="Books read" value={fmt(stats.booksRead)} note={stats.undatedFinishes ? `${plural(stats.undatedFinishes, "finish", "finishes")} without a date` : undefined} />
        <Tile icon={icon(BookOpenText)} label="Pages read" value={fmt(stats.pagesRead)} note="across every finished read" />
        {stats.minutesListened > 0 && <Tile icon={icon(Headphones)} label="Hours listened" value={fmt(Math.round(stats.minutesListened / 60))} note="of audiobooks finished" />}
        <Tile icon={icon(Ruler)} label="Average length" value={stats.averagePages ? fmt(stats.averagePages) : "–"} note="pages per book" />
        <Tile icon={icon(Flame)} label="Current streak" value={plural(stats.streak, "day")} note={stats.streak ? "keep it going today" : "read a page to start one"} />
        <Tile icon={icon(Repeat)} label="Re-reads" value={fmt(stats.rereads)} note={stats.rereadBooks ? `across ${plural(stats.rereadBooks, "book")}` : "none yet"} />
        <Tile icon={icon(Undo2)} label="Did not finish" value={stats.dnfRate === null ? "–" : `${Math.round(stats.dnfRate * 100)}%`} note={stats.dnf ? `${plural(stats.dnf, "book")} put down` : "of the books you started"} />
        <Tile icon={icon(Star)} label="Average rating" value={stats.averageRating ? `${stats.averageRating} ★` : "–"} note={stats.ratedBooks ? `from ${plural(stats.ratedBooks, "rating")}` : "no ratings yet"} />
        <Tile icon={icon(Ruler)} label="Longest book" value={stats.longestBook ? fmt(stats.longestBook.pages) : "–"} note={stats.longestBook?.title} />
      </View>

      {wrappedYears.length > 0 && (
        <View style={[styles.wrapped, { backgroundColor: colors.muted, borderLeftColor: accent }]}>
          <Text variant="label">Your year in books, wrapped up</Text>
          <View style={styles.pills}>
            {wrappedYears.map((y) => (
              <Pressable key={y} accessibilityRole="link" onPress={() => router.push(`/wrapped/${y}`)} style={[styles.pill, { backgroundColor: colors.foreground }]}>
                <Text variant="label" style={{ color: colors.background }}>{y} Wrapped</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <WrapCardPicker accent={accent} wrapDesigns={data.wrapDesigns ?? false} />
      <MonthlyWrapCard accent={accent} />

      <Section title="Books per year"><ColumnChart data={yearBooks} accent={accent} label="Books finished per year" /></Section>
      <Section title="Pages per year"><ColumnChart data={yearPages} accent={accent} label="Pages read per year" /></Section>

      <Section title={`${year}, month by month`}>
        {stats.years.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} accessibilityLabel="Year">
            {[...stats.years].reverse().map((y) => {
              const current = y.year === year;
              return (
                <Pressable key={y.year} accessibilityRole="button" accessibilityState={{ selected: current }} onPress={() => setPicked(y.year)} style={[styles.yearPill, current && { backgroundColor: colors.foreground }]}>
                  <Text variant="label" style={{ color: current ? colors.background : colors.mutedForeground }}>{y.year}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        {yearTotal && yearTotal.books > 0 ? (
          <View style={{ gap: 20 }}>
            <View style={{ gap: 8 }}>
              <Text variant="muted">Books · {fmt(yearTotal.books)}</Text>
              <ColumnChart data={monthBooks} accent={accent} label={`Books finished each month of ${year}`} />
            </View>
            <View style={{ gap: 8 }}>
              <Text variant="muted">Pages · {fmt(yearTotal.pages)}</Text>
              <ColumnChart data={monthPages} accent={accent} label={`Pages read each month of ${year}`} />
            </View>
          </View>
        ) : (
          <Text variant="muted">No finished books dated {year} yet.</Text>
        )}
      </Section>

      <Section title="How you rate">
        {stats.ratedBooks ? <ColumnChart data={ratingData} accent={accent} label="Books per star rating" /> : <Text variant="muted">Rate a book (quarter stars welcome) and your spread shows up here.</Text>}
      </Section>
      <Section title="Top genres">
        {stats.genres.length ? <RankedBars data={stats.genres.map((g) => ({ label: g.name, value: g.count, detail: plural(g.count, "book") }))} accent={accent} label="Genres you read most" /> : <Text variant="muted">Books you finish with a genre will be counted here.</Text>}
      </Section>
      <Section title="Top authors">
        {stats.authors.length ? <RankedBars data={stats.authors.map((a) => ({ label: a.name, value: a.count, detail: plural(a.count, "book") }))} accent={accent} label="Authors you read most" /> : <Text variant="muted">Your most-read authors will show up here.</Text>}
      </Section>

      <Section title="Reading goals">
        {stats.goals.length ? (
          <View style={{ gap: 16 }}>
            {stats.goals.map((g) => {
              const percent = Math.min(100, Math.round((g.completed / g.target) * 100));
              return (
                <View key={g.year} style={{ gap: 6 }}>
                  <View style={styles.line}>
                    <Text variant="label">{g.year}</Text>
                    <Text variant="muted">
                      {fmt(g.completed)} of {plural(g.target, "book")}
                      {g.met ? <Text variant="label" style={{ color: accent }}>{"  "}Goal met</Text> : null}
                    </Text>
                  </View>
                  <View
                    accessibilityRole="progressbar"
                    accessibilityLabel={`${g.year} goal`}
                    accessibilityValue={{ min: 0, max: g.target, now: Math.min(g.completed, g.target) }}
                    style={[styles.track, { backgroundColor: colors.muted }]}
                  >
                    <View style={[styles.fill, { width: `${percent}%`, backgroundColor: accent }]} />
                  </View>
                  {g.targetPages ? <GoalLine label="Page goal" value={`${fmt(g.pages)} of ${plural(g.targetPages, "page")}`} met={g.pages >= g.targetPages} accent={accent} /> : null}
                  {g.monthsCounted > 0 ? (
                    <GoalLine
                      label={g.paceIsCustom ? `${plural(g.pacePerMonth, "book")} a month` : `Pace: ${formatPace(g.pacePerMonth)} a month`}
                      value={`${g.monthsMet} of ${plural(g.monthsCounted, "month")} on pace`}
                      met={g.monthsMet === g.monthsCounted}
                      accent={accent}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <Text variant="muted">Set a yearly goal from your library and each year's result is kept here.</Text>
        )}
      </Section>

      <Text variant="small" style={{ textAlign: "center" }}>
        Every stat on this page is free, and always will be. It's your reading.
        {stats.timeZone !== "UTC" ? ` Days and months follow ${stats.timeZone} time.` : ""}
      </Text>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, { borderColor: colors.border }]}>
      <Text variant="title">{title}</Text>
      {children}
    </View>
  );
}

function Tile({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { borderColor: colors.border }]} accessible accessibilityLabel={`${label}: ${value}${note ? `, ${note}` : ""}`}>
      <View style={styles.tileLabel}>{icon}<Text variant="muted" style={{ flexShrink: 1 }}>{label}</Text></View>
      <Text style={{ fontSize: 26, lineHeight: 32, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{value}</Text>
      {note ? <Text variant="small" numberOfLines={2}>{note}</Text> : null}
    </View>
  );
}

// A Plus goal's line under the yearly bar. Shown whenever one is set: stats are never gated.
function GoalLine({ label, value, met, accent }: { label: string; value: string; met: boolean; accent: string }) {
  return (
    <View style={styles.line}>
      <Text variant="small">{label}</Text>
      <Text variant="small">
        {value}
        {met ? <Text variant="small" style={{ color: accent, fontWeight: "600" }}>{"  "}Met</Text> : null}
      </Text>
    </View>
  );
}

function StatsEmpty({ accent }: { accent: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: colors.border }]}>
      <BookOpen size={40} color={accent} />
      <Text variant="title" style={{ textAlign: "center" }}>Nothing to count yet</Text>
      <Text variant="muted" style={{ textAlign: "center" }}>
        Finish a book and this page fills in: books and pages by year, your ratings, favourite genres and authors, and your streak.
        Already keep track somewhere else? Bring your history with you.
      </Text>
      <Button title="Import from Goodreads or StoryGraph" onPress={() => router.push("/import" as never)} />
      <Button title="Add a book" variant="outline" onPress={() => router.push("/add-book")} />
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { flexBasis: "47%", flexGrow: 1, borderWidth: 1, borderRadius: 16, padding: 14, gap: 4 },
  tileLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  wrapped: { borderLeftWidth: 4, borderRadius: 16, padding: 16, gap: 10 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  yearPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  section: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  empty: { borderWidth: 1, borderStyle: "dashed", borderRadius: 16, paddingHorizontal: 20, paddingVertical: 40, alignItems: "center", gap: 12 },
});
