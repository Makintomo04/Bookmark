import { createContext, useContext, useId, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import useSWR from "swr";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { readableInk, shade } from "@bookmark/shared/colour";
import { DEFAULT_COLOUR } from "@bookmark/shared/profile";
import type { WrappedData } from "@bookmark/shared/statsTypes";
import * as copy from "@bookmark/shared/wrappedCopy";
import { Medal } from "@/components/achievements/Medal";
import { BookCover } from "@/components/books/BookCover";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { webUrl } from "@/lib/config";
import { useTheme } from "@/lib/theme";

// A year's Wrapped (the web's /wrapped/<year>), card by card in the same order and words: the copy is
// shared with the web. Your own by default; ?username=<name> opens someone else's.

const fmt = (n: number) => n.toLocaleString("en-GB");
const INK = "#0B0B0C";

type WrappedResponse = { year: number; wrapped: WrappedData; years: number[]; owner: { username: string | null; accent: string | null }; own: boolean };
type Tone = "accent" | "ink" | "paper";

export default function Wrapped() {
  const { year, username } = useLocalSearchParams<{ year: string; username?: string }>();
  const { colors } = useTheme();
  const key = `/api/wrapped/${year}${username ? `?username=${encodeURIComponent(username)}` : ""}`;
  const { data, error, isLoading } = useSWR<WrappedResponse>(key);

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (error || !data) {
    return (
      <Screen edges={["left", "right"]}>
        <Stack.Screen options={{ title: "Wrapped" }} />
        <Notice tone="error" message={error?.status === 404 ? "There's no Wrapped for that year." : "We couldn't load this Wrapped. Try again in a moment."} />
      </Screen>
    );
  }

  const { wrapped: w, own } = data;
  const name = data.owner.username ?? "This reader";
  const accent = data.owner.accent || DEFAULT_COLOUR;
  const voice: copy.Voice = { own, name };
  const title = own ? `Your ${w.year} in books` : `${name}'s ${w.year} in books`;
  const otherYears = data.years.filter((y) => y !== w.year);
  const yearLinks = otherYears.length > 0 && (
    <View style={styles.years} accessibilityLabel="Other years">
      {otherYears.map((y) => (
        <Pressable
          key={y}
          accessibilityRole="link"
          onPress={() => router.replace({ pathname: "/wrapped/[year]", params: { year: String(y), ...(own ? {} : { username: name }) } })}
          style={[styles.yearPill, { borderColor: colors.border }]}
        >
          <Text variant="label">{y}</Text>
        </Pressable>
      ))}
    </View>
  );

  if (w.books === 0) {
    return (
      <Screen edges={["left", "right"]}>
        <Stack.Screen options={{ title: `${w.year} Wrapped` }} />
        <Card tone="ink" accent={accent} label={title}>
          <Kicker>Bookmark Wrapped</Kicker>
          <Text variant="hero" style={{ color: "#FAFAFA", marginTop: 8 }}>{title}</Text>
          <Line>
            {own
              ? w.isCurrentYear
                ? `No finished books dated ${w.year} yet. Finish one and this starts filling in.`
                : `No finished books dated ${w.year}. If you read them somewhere else, bring them over and this fills in.`
              : `${name} hasn't finished a book dated ${w.year} on Bookmark.`}
          </Line>
          {own && (
            <View style={{ gap: 10, marginTop: 24 }}>
              <Button title="Import your reading history" onPress={() => router.push("/import" as never)} />
              <Button title="See your stats" variant="outline" onPress={() => router.push("/stats")} />
            </View>
          )}
        </Card>
        {yearLinks}
      </Screen>
    );
  }

  const busiest = w.busiestMonth;
  const peak = Math.max(1, ...w.months.map((m) => m.books));
  const shareUrl = webUrl(`/u/${encodeURIComponent(name)}/wrapped/${w.year}`);

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen options={{ title: `${w.year} Wrapped` }} />

      <Card tone="ink" accent={accent} label="Introduction">
        <Kicker>Bookmark Wrapped</Kicker>
        <Text variant="hero" style={{ color: "#FAFAFA", marginTop: 8 }}>{title}</Text>
        <Line>{copy.introLine(w, voice)}</Line>
      </Card>

      <Card tone="accent" accent={accent} label="Books and pages">
        <Kicker>Books finished</Kicker>
        <Big>{fmt(w.books)}</Big>
        <Line>{copy.booksLine(w, voice)}</Line>
        <Rule />
        <Kicker>Pages turned</Kicker>
        <Big>{fmt(w.pages)}</Big>
        <Line>{copy.pagesLine(w.pages)}</Line>
      </Card>

      {busiest && (
        <Card tone="paper" accent={accent} label="Busiest month">
          <Kicker>Busiest month</Kicker>
          <Big>{copy.MONTHS[busiest.month]}</Big>
          <Line>{copy.busiestLine(w, voice)}</Line>
          {/* The year at a glance, the busiest month in the accent. */}
          <View style={styles.months} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {w.months.map((m, i) => (
              <View key={i} style={styles.month}>
                <View style={[styles.monthBar, { height: m.books ? `${(m.books / peak) * 100}%` : 2, backgroundColor: i === busiest.month ? accent : colors.border }]} />
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{copy.MONTHS[i][0]}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {w.topGenre && (
        <Card tone="ink" accent={accent} label="Top genre">
          <Kicker>Top genre</Kicker>
          <Big>{w.topGenre.name}</Big>
          <Line>{copy.genreLine(w, voice)}</Line>
          {w.topAuthor && w.topAuthor.count > 1 && (
            <Line>Most-read author: <Ink style={{ fontWeight: "700", fontSize: 19 }}>{w.topAuthor.name}</Ink>, {copy.plural(w.topAuthor.count, "book")}.</Line>
          )}
        </Card>
      )}

      {w.topRated && (
        <Card tone="accent" accent={accent} label="Top-rated book">
          <Kicker>{own ? "Your favourite" : `${name}'s favourite`}</Kicker>
          <BookFeature book={w.topRated} accent={accent}>
            <Ink style={{ fontSize: 24, letterSpacing: 2, marginTop: 8 }} accessibilityLabel={`${w.topRated.rating} stars`}>
              {"★".repeat(Math.floor(w.topRated.rating))}{w.topRated.rating % 1 ? "½" : ""}
            </Ink>
          </BookFeature>
          <Line>{copy.topRatedLine(w)}</Line>
        </Card>
      )}

      {w.longestBook && (
        <Card tone="paper" accent={accent} label="Longest book">
          <Kicker>The big one</Kicker>
          {w.longestBook.id !== w.topRated?.id ? (
            <>
              <BookFeature book={w.longestBook} accent={accent}>{null}</BookFeature>
              <Line>{copy.longestLine(w, voice)}</Line>
            </>
          ) : (
            <Line>{`The favourite was also the longest: ${copy.longestLine(w, voice)}`}</Line>
          )}
        </Card>
      )}

      {w.medals.length > 0 && (
        <Card tone="ink" accent={accent} label="Medals earned">
          <Kicker>Medals earned</Kicker>
          <Big>{fmt(w.medals.length)}</Big>
          <Line>{copy.medalsLine(w.medals.length, voice)}</Line>
          <View style={styles.medals}>
            {w.medals.slice(-12).map((m) => (
              <View key={m.key} style={styles.medal}>
                <View style={{ alignSelf: "center", marginBottom: 6 }}><Medal achievementKey={m.achievementKey} earned size={60} /></View>
                <Ink style={{ fontWeight: "600", textAlign: "center" }}>{m.title}</Ink>
                <Ink style={{ fontSize: 12, opacity: 0.7, textAlign: "center" }}>{m.achievement}</Ink>
              </View>
            ))}
          </View>
        </Card>
      )}

      <Card tone="paper" accent={accent} label="Reader tier">
        <Kicker>Reader tier</Kicker>
        {w.tier ? (
          <View style={styles.tier}>
            <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
              <Defs>
                <LinearGradient id="tier" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={w.tier.light} />
                  <Stop offset="0.55" stopColor={w.tier.colour} />
                  <Stop offset="1" stopColor={w.tier.shade} />
                </LinearGradient>
              </Defs>
              <Rect width="100" height="100" fill="url(#tier)" />
            </Svg>
            <Text variant="hero" style={{ color: "#171717" }}>{w.tier.label}</Text>
          </View>
        ) : (
          <Big>{fmt(w.tierBooks)}</Big>
        )}
        <Line>{copy.tierLine(w, voice)}</Line>
      </Card>

      <Card tone="accent" accent={accent} label="Reading goal">
        <Kicker>{`${w.year} goal`}</Kicker>
        <Big>{copy.goalHeadline(w)}</Big>
        <Line>{copy.goalLine(w, voice)}</Line>
        <Line>{copy.dnfLine(w.dnf, voice)}</Line>
      </Card>

      <Card tone="ink" accent={accent} label="Share" center>
        <Kicker>That's a wrap</Kicker>
        <Text variant="display" style={{ color: "#FAFAFA", textAlign: "center", marginTop: 12 }}>{copy.outroLine(w, voice)}</Text>
        {own && (
          <View style={{ marginTop: 24, alignSelf: "stretch" }}>
            <Button title="Share your Wrapped" onPress={() => void Share.share({ message: `My ${w.year} in books ${shareUrl}`, url: shareUrl })} />
          </View>
        )}
      </Card>

      {yearLinks}
    </Screen>
  );
}

// The ink colour for whatever card it sits on, passed down so every line on a card matches.
const InkColour = createContext("#FAFAFA");

// One card in the stack. Accent cards sit on the reader's colour with whichever ink reads on it; ink
// cards are near-black with the accent glowing in a corner; paper cards follow the app's theme.
function Card({ tone, accent, label, center, children }: { tone: Tone; accent: string; label: string; center?: boolean; children: ReactNode }) {
  const { colors } = useTheme();
  const id = useId().replace(/:/g, "");
  const ink = tone === "accent" ? readableInk(accent) : tone === "ink" ? "#FAFAFA" : colors.foreground;
  return (
    <View
      accessibilityLabel={label}
      style={[styles.card, center && { alignItems: "center" }, tone === "paper" ? { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background } : { backgroundColor: tone === "ink" ? INK : accent }]}
    >
      {tone !== "paper" && (
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            {/* The gradient runs away from the ink (darker under white text, lighter under dark), so the text keeps its contrast. */}
            <LinearGradient id={`l${id}`} x1="0.2" y1="0" x2="0.8" y2="1">
              <Stop offset="0" stopColor={accent} />
              <Stop offset="1" stopColor={shade(accent, ink === "#ffffff" ? -0.35 : 0.3)} />
            </LinearGradient>
            <RadialGradient id={`r${id}`} cx={tone === "ink" ? "0" : "0.85"} cy={tone === "ink" ? "0" : "0.1"} r={tone === "ink" ? "0.55" : "0.5"}>
              <Stop offset="0" stopColor={tone === "ink" ? accent : "#ffffff"} stopOpacity={tone === "ink" ? 0.33 : 0.18} />
              <Stop offset="1" stopColor={tone === "ink" ? accent : "#ffffff"} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {tone === "accent" && <Rect width="100" height="100" fill={`url(#l${id})`} />}
          <Rect width="100" height="100" fill={`url(#r${id})`} />
        </Svg>
      )}
      <InkColour.Provider value={ink}>{children}</InkColour.Provider>
    </View>
  );
}

function Ink({ style, ...props }: ComponentProps<typeof Text>) {
  return <Text {...props} style={[{ color: useContext(InkColour) }, style]} />;
}

function Kicker({ children }: { children: ReactNode }) {
  return <Ink style={{ fontSize: 13, fontWeight: "600", letterSpacing: 2.4, textTransform: "uppercase", opacity: 0.8 }}>{children}</Ink>;
}

function Big({ children }: { children: ReactNode }) {
  return <Ink variant="hero" style={{ fontSize: 56, lineHeight: 60, marginTop: 8, fontVariant: ["tabular-nums"] }} adjustsFontSizeToFit numberOfLines={2}>{children}</Ink>;
}

function Line({ children }: { children: ReactNode }) {
  return children ? <Ink style={{ fontSize: 19, lineHeight: 26, marginTop: 14, opacity: 0.9 }}>{children}</Ink> : null;
}

function Rule() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: useContext(InkColour), opacity: 0.6, marginVertical: 24 }} />;
}

function BookFeature({ book, accent, children }: { book: WrappedData["longestBook"]; accent: string; children: ReactNode }) {
  if (!book) return null;
  return (
    <View style={{ gap: 16, marginTop: 20 }}>
      <BookCover book={book} width={128} fallbackColour={accent} />
      <View>
        <Ink style={{ fontSize: 24, lineHeight: 30, fontWeight: "700" }}>{book.title}</Ink>
        <Ink style={{ fontSize: 17, opacity: 0.8, marginTop: 2 }}>{book.author}</Ink>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, paddingHorizontal: 22, paddingVertical: 40, overflow: "hidden", minHeight: 360, justifyContent: "center" },
  months: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 110, marginTop: 28 },
  month: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  monthBar: { width: "100%", borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  medals: { flexDirection: "row", flexWrap: "wrap", rowGap: 18, marginTop: 24 },
  medal: { width: "33.3%", paddingHorizontal: 4, gap: 2 },
  tier: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 24, paddingVertical: 10, marginTop: 14, overflow: "hidden" },
  years: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  yearPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
});
