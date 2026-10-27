import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import useSWR from "swr";
import { DEFAULT_COLOUR } from "@bookmark/shared/profile";
import { NEARLY_FINISHED_PERCENT, PERCENT_QUICK_ADDS, QUICK_ADDS, entersPercent, formatMinutes, formatStoppedAt, percentToPosition, progressPercent, progressScale } from "@bookmark/shared/progress";
import { spiceAskable, type SpiceLevel, type TagAggregate } from "@bookmark/shared/workTags";
import { seriesPlaceLabel } from "@bookmark/shared/series";
import { AuthorNames } from "@/components/authors/AuthorNames";
import { BookCover } from "@/components/books/BookCover";
import { CatchMeUp } from "@/components/books/CatchMeUp";
import { SpiceLine, SpicePicker } from "@/components/books/Spice";
import { StarRating } from "@/components/books/StarRating";
import { FollowSeries } from "@/components/series/FollowSeries";
import { SeriesSection } from "@/components/series/SeriesSection";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Segmented } from "@/components/ui/Segmented";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, api } from "@/lib/api";
import { goBack } from "@/lib/navigation";
import { bookSeriesKey, type BookSeries } from "@/lib/series";
import { formatDay, groupShelf, isRereading, saveBook, useBooks, type Book, type BookAction, type BookRead } from "@/lib/books";
import { useTheme } from "@/lib/theme";

// The book page: what the web's BookUpdateModal does, as a screen. Start a book, log progress, finish,
// pause or stop it, rate and review it, report its spice, and see earlier reads. Moods and warnings,
// sending it to a friend and its reading circles follow in the port.

const REVIEW_MAX = 2000;
// Pauses skew the rate early on, so wait for a week of reading before guessing (the web's PACE_MIN_DAYS).
const PACE_MIN_DAYS = 7;
const plural = (n: number, word: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? word : `${word}s`}`;
const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

const TITLES: Record<Book["status"], [string, string]> = {
  NOT_STARTED: ["Start reading", "Start listening"],
  STARTED: ["Update progress", "Update progress"],
  PAUSED: ["Paused", "Paused"],
  COMPLETED: ["Rating and review", "Rating and review"],
  DNF: ["Did not finish", "Did not finish"],
  NOT_INTERESTED: ["Will not read", "Will not read"],
};

export default function BookPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: books, isLoading } = useBooks();
  const book = books?.find((b) => b.id === id);
  const { colors } = useTheme();

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (!book) {
    return (
      <Screen>
        <Text variant="display">Book not found</Text>
        <Text variant="muted">It may have been removed from your shelf.</Text>
        <Button title="Back to your library" variant="outline" onPress={() => goBack()} />
      </Screen>
    );
  }
  return <BookEditor key={book.id} book={book} books={books ?? []} />;
}

function BookEditor({ book, books }: { book: Book; books: Book[] }) {
  const { colors, radii, fonts } = useTheme();
  const { data: user } = useSWR<{ favColour: string | null }>("/api/user");
  const { data: reads } = useSWR<BookRead[]>(`/api/books/${book.id}/reads`);
  const { data: tags, mutate: tagsMutate } = useSWR<TagAggregate>(`/api/works/tags?bookId=${book.id}`);
  const accent = user?.favColour || DEFAULT_COLOUR;

  const { unit, total: pages, current: startPage } = progressScale(book);
  const onMinutes = unit === "MINUTES";
  const fmt = (n: number) => (onMinutes ? formatMinutes(n) : String(n));
  const hasPageCount = pages > 0;
  // Kindle readers type a percent instead of a page (Book.logsPercent remembers it, on web too); a book
  // with no length can only take one. pageInput then holds the percent (0-100).
  const [inPercent, setInPercent] = useState(entersPercent(book));
  const percentMode = inPercent || !hasPageCount;
  const max = percentMode ? 100 : pages;
  const startValue = percentMode ? Math.round(progressPercent(book)) : startPage;

  const [pageInput, setPageInput] = useState(String(startValue));
  const [finished, setFinished] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [pageBeforeFinish, setPageBeforeFinish] = useState<number | null>(null);
  const [showStartPage, setShowStartPage] = useState(false);
  const [rating, setRating] = useState(book.rating ?? 0);
  const [review, setReview] = useState(book.review ?? "");
  const [reviewSpoiler, setReviewSpoiler] = useState(!!book.reviewSpoiler);
  const [reviewPrivate, setReviewPrivate] = useState(!!book.reviewPrivate);
  // Spice: reported here; moods and warnings are kept as they are, since this screen doesn't edit them yet.
  const [spice, setSpice] = useState<SpiceLevel | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The saved place changed (a save here, or on another device): start again from it.
  useEffect(() => {
    const percent = entersPercent(book);
    setInPercent(percent);
    setPageInput(String(percent ? Math.round(progressPercent(book)) : startPage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPage, book.currentPercent, book.logsPercent]);
  useEffect(() => setSpice(tags?.mine?.spice ?? null), [tags]);

  const status = book.status;
  const typed = parseInt(pageInput, 10);
  const isOverTotal = !percentMode && !isNaN(typed) && typed > pages;
  // `value` is what's typed; `page` is always the place on the book's own scale.
  const value = isNaN(typed) ? startValue : clamp(typed, max);
  const page = percentMode ? percentToPosition(value, pages) : value;
  const delta = value - startValue;
  const progress = percentMode ? value : Math.round(progressPercent({ ...book, currentPercent: null, ...at(page) }));
  const isActive = status === "STARTED" || status === "PAUSED";
  const isClosed = status === "COMPLETED" || status === "DNF";
  const ratingChanged = rating !== (book.rating ?? 0);
  const reviewChanged = review !== (book.review ?? "") || reviewSpoiler !== !!book.reviewSpoiler || reviewPrivate !== !!book.reviewPrivate;
  // Spice is only asked of a reader who finished a book it applies to (the server holds the same line).
  const canReportSpice = (status === "COMPLETED" || finished) && spiceAskable(tags, tags?.mine?.warnings ?? []);
  const spiceChanged = canReportSpice && spice !== (tags?.mine?.spice ?? null);
  const modeChanged = hasPageCount && inPercent !== entersPercent(book);
  const hasChanges = isActive ? delta !== 0 || modeChanged || finished || stopping : isClosed ? ratingChanged || reviewChanged || spiceChanged : false;
  const canSave = !saving && (status === "NOT_STARTED" || status === "PAUSED" || hasChanges);
  function at(n: number) { return onMinutes ? { currentMinute: n } : { currentPage: n }; }
  // Where the reader is, as the API takes it: a percent (and the choice to keep logging one), or a position.
  const place = () => (percentMode
    ? { currentPercent: value, ...(hasPageCount && { logsPercent: true }) }
    : { ...at(page), ...(book.logsPercent && { logsPercent: false }) });
  const setPage = (n: number) => setPageInput(String(clamp(n, max)));

  // Switching keeps the reader's place: 111 of 300 becomes 37%, and back.
  const changeMode = (mode: "unit" | "percent") => {
    const toPercent = mode === "percent";
    if (toPercent === inPercent) return;
    setPageInput(String(toPercent ? progress : page));
    setInPercent(toPercent);
  };

  const toggleFinished = () => {
    if (!finished) {
      setPageBeforeFinish(value);
      setPageInput(String(max));
    } else {
      setPageInput(String(pageBeforeFinish ?? startValue));
      setPageBeforeFinish(null);
    }
    setFinished(!finished);
    setStopping(false);
  };

  const toggleStopping = () => {
    if (finished) {
      setPageInput(String(pageBeforeFinish ?? startValue));
      setPageBeforeFinish(null);
      setFinished(false);
    }
    setStopping(!stopping);
  };

  const run = async (payload: { action: BookAction } & Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await saveBook({ id: book.id, ...payload });
      // After the shelf change, so a book just finished counts as finished for its spice.
      if (spiceChanged) {
        try {
          await api.put("/api/works/tags", { bookId: book.id, moods: tags?.mine?.moods ?? [], warnings: tags?.mine?.warnings ?? [], spice });
          void tagsMutate();
        } catch (e) {
          setError(e instanceof ApiError ? e.message : "Saved, but your spice level didn't save. Try again.");
          setSaving(false);
          return;
        }
      }
      goBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save. Check your connection and try again.");
      setSaving(false);
    }
  };

  const save = () => {
    if (!canSave) return;
    const ratingAndReview = { rating: rating > 0 ? rating : null, review, reviewSpoiler, reviewPrivate };
    if (status === "NOT_STARTED") return run({ action: "start", ...place() });
    if (isActive && finished) return run({ action: "complete", ...ratingAndReview });
    if (isActive && stopping) return run({ action: "dnf", ...place(), ...ratingAndReview });
    if (status === "STARTED") return run({ action: "progress", ...place() });
    if (status === "PAUSED") return run({ action: "resume", ...place() });
    return run({ action: "rate", ...ratingAndReview });
  };

  const rereading = status === "STARTED" && isRereading(book, groupShelf(books).finished);
  const meta = status === "STARTED" && book.startedAt ? `${rereading ? "Rereading since" : "Started"} ${formatDay(book.startedAt)}`
    : status === "COMPLETED" && book.completedAt ? `Finished ${formatDay(book.completedAt)}`
    : status === "PAUSED" ? `Paused${book.stoppedAt ? ` since ${formatDay(book.stoppedAt)}` : ""}`
    : status === "DNF" ? `${formatStoppedAt(book)}${hasPageCount ? ` of ${fmt(pages)}` : ""}${book.stoppedAt ? ` on ${formatDay(book.stoppedAt)}` : ""}`
    : status === "NOT_STARTED" ? "On your Want to read shelf"
    : status === "NOT_INTERESTED" ? "On your Will not read shelf. Only you can see it." : "";

  const deltaText = !isActive || delta === 0 ? ""
    : percentMode ? `${Math.abs(delta)}% ${delta > 0 ? "since" : "back from"} your last update`
    : delta > 0 ? `${onMinutes ? formatMinutes(delta) : plural(delta, "page")} since your last update`
    : `${onMinutes ? formatMinutes(-delta) : plural(-delta, "page")} back from your last update`;
  const daysReading = book.startedAt ? (Date.now() - new Date(book.startedAt).getTime()) / 86_400_000 : 0;
  const daysLeft = status === "STARTED" && !finished && hasPageCount && startPage > 0 && page > 0 && page < pages && daysReading >= PACE_MIN_DAYS
    ? Math.round((pages - page) / (page / daysReading)) : null;
  const paceText = daysLeft === null ? ""
    : daysLeft < 1 ? "Less than a day left at your pace"
    : daysLeft < 14 ? `About ${daysLeft === 1 ? "a day" : `${daysLeft} days`} left at your pace`
    : daysLeft < 60 ? `About ${plural(Math.round(daysLeft / 7), "week")} left at your pace`
    : `About ${plural(Math.round(daysLeft / 30), "month")} left at your pace`;

  const primaryLabel = status === "NOT_STARTED" ? (onMinutes ? "Start listening" : "Start reading")
    : isClosed ? "Save"
    : finished ? "Mark as finished"
    : stopping ? "Mark as did not finish"
    : status === "PAUSED" ? (onMinutes ? "Resume listening" : "Resume reading")
    : "Save progress";
  const showPrimary = status !== "NOT_INTERESTED" && (!isClosed || hasChanges);
  const history = (reads ?? []).slice().reverse();
  const showHistory = history.length > 1 || (history.length === 1 && status === "NOT_STARTED");

  const pageField = (
    <TextInput
      value={pageInput}
      onChangeText={(t) => setPageInput(t.replace(/\D/g, "").slice(0, percentMode ? 3 : 5))}
      onBlur={() => setPageInput(String(value))}
      keyboardType="number-pad"
      returnKeyType="done"
      selectTextOnFocus
      editable={!saving && !finished}
      accessibilityLabel={percentMode ? "Percent read" : onMinutes ? "Minutes listened" : "Current page"}
      // Sized to its digits, like the web's, so "of 476" sits right beside it.
      style={[styles.bigNumber, { width: Math.max(56, (pageInput.length || 1) * 26 + 12), color: colors.foreground, borderBottomColor: colors.input, fontFamily: fonts.display }]}
    />
  );

  // Only a book with a length can switch: without one there's no page to type.
  const modeToggle = hasPageCount && (
    <View style={{ width: 132 }}>
      <Segmented
        options={[{ value: "unit", label: onMinutes ? "Min" : "Page" }, { value: "percent", label: "%" }]}
        value={inPercent ? "percent" : "unit"}
        onChange={changeMode}
        disabled={saving || finished}
      />
    </View>
  );
  // "% · page 111 of 300" beside a percent, "of 300" beside a page.
  const besideNumber = percentMode
    ? `%${hasPageCount ? ` · ${onMinutes ? `${formatMinutes(page)} of ${formatMinutes(pages)}` : `page ${page} of ${pages}`}` : ""}`
    : onMinutes ? `min · ${formatMinutes(page)} of ${formatMinutes(pages)}` : `of ${pages}`;

  return (
    <Screen>
      <Stack.Screen options={{ title: TITLES[status][onMinutes ? 1 : 0] }} />
      <View style={styles.bookRow}>
        <BookCover book={book} width={88} fallbackColour={accent} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="title" style={{ fontSize: 20, lineHeight: 26 }}>{book.title}</Text>
          <AuthorNames author={book.author} />
          {meta ? <Text variant="small">{meta}</Text> : null}
          <BookSeriesPlace bookId={book.id} />
          <View style={{ alignItems: "flex-start" }}>
            <Button title="Edit details" variant="ghost" disabled={saving} onPress={() => router.push(`/book/edit/${book.id}`)} />
          </View>
        </View>
      </View>

      {error && <Notice tone="error" message={error} />}

      {/* Coming back to a book (or starting the next in a series): the recap offer comes first. */}
      {(isActive || status === "NOT_STARTED") && !finished && !stopping && <CatchMeUp bookId={book.id} />}

      {/* What other readers say, for anyone who hasn't given their own answer yet. */}
      {!isClosed && !finished && !stopping && tags?.spiceApplies && <SpiceLine spice={tags.spice} />}

      {status === "NOT_STARTED" && (
        showStartPage ? (
          <View style={{ gap: 6 }}>
            <View style={styles.labelRow}>
              <Text variant="label">{percentMode ? "How far you are" : onMinutes ? "Minutes listened so far" : "Current page"}</Text>
              {modeToggle}
            </View>
            <View style={styles.numberRow}>{pageField}<Text variant="muted">{percentMode ? besideNumber : `of ${fmt(pages)}`}</Text></View>
            {isOverTotal && <Text variant="small">{onMinutes ? `This audiobook runs ${formatMinutes(pages)}.` : `This book has ${pages} pages.`}</Text>}
          </View>
        ) : (
          <View style={{ gap: 4, alignItems: "flex-start" }}>
            <Text variant="muted">{onMinutes ? "Starts from the beginning." : "Starts from the first page."}</Text>
            <Button variant="ghost" title={onMinutes || percentMode ? "Already partway through? Set how far you are" : "Already partway through? Set your page"} onPress={() => setShowStartPage(true)} />
          </View>
        )
      )}

      {isActive && (
        <View style={{ gap: 10 }}>
          <View style={styles.labelRow}>
            <Text variant="label">{percentMode ? "You're at" : onMinutes ? "You've listened for" : "You're on page"}</Text>
            {modeToggle}
          </View>
          <View style={[styles.numberRow, { justifyContent: "space-between" }]}>
            <View style={[styles.numberRow, { flexShrink: 1 }]}>
              {pageField}
              <Text variant="muted" style={{ fontSize: 17, flexShrink: 1 }}>{besideNumber}</Text>
            </View>
            {!percentMode && <Text variant="title">{progress}%</Text>}
          </View>
          <View style={[styles.track, { backgroundColor: colors.muted }]}>
            <View style={[styles.fill, { width: `${progress}%`, backgroundColor: accent }]} />
          </View>
          {isOverTotal && <Text variant="small">{onMinutes ? `This audiobook runs ${formatMinutes(pages)}.` : `This book has ${pages} pages.`}</Text>}
          <View style={styles.quickRow}>
            {(percentMode ? PERCENT_QUICK_ADDS : QUICK_ADDS[unit]).map((n) => (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityLabel={`Add ${n} ${percentMode ? "percent" : onMinutes ? "minutes" : "pages"}`}
                disabled={saving || finished || value >= max}
                onPress={() => setPage(value + n)}
                style={({ pressed }) => [styles.quick, { borderRadius: radii.md, borderColor: colors.input, backgroundColor: pressed ? colors.muted : "transparent" }, (finished || value >= max) && { opacity: 0.5 }]}
              >
                <Text style={{ fontFamily: fonts.sansSemibold }}>+{n}{percentMode ? "%" : ""}</Text>
              </Pressable>
            ))}
          </View>
          {deltaText ? <Text variant="small" accessibilityLiveRegion="polite">{deltaText}</Text> : null}
          {paceText ? <Text variant="small">{paceText}</Text> : null}
          {/* Kindle books often end in acknowledgements and a preview of the next book, from about 97%. */}
          {(value === max || (percentMode && value >= NEARLY_FINISHED_PERCENT)) && !finished && (
            <Button
              variant="ghost"
              title={value < max ? "Nearly there: the rest may be extras. Mark it as finished?" : onMinutes || percentMode ? "That's the end. Mark it as finished?" : "That's the last page. Mark it as finished?"}
              onPress={toggleFinished}
            />
          )}
          {!hasPageCount && (
            <View style={{ alignItems: "flex-start" }}>
              <Button title="Add a page count to count its pages in your stats" variant="ghost" onPress={() => router.push(`/book/edit/${book.id}`)} />
            </View>
          )}
        </View>
      )}

      {isActive && !stopping && (
        <View style={styles.switchRow}>
          <Text style={{ fontFamily: fonts.sansMedium }}>I finished it</Text>
          <Switch value={finished} onValueChange={toggleFinished} disabled={saving} trackColor={{ true: accent }} accessibilityLabel="I finished it" />
        </View>
      )}

      {isActive && !finished && (stopping ? (
        <View style={{ gap: 2 }}>
          <Text>Stopping at {percentMode ? `${value}%` : `${onMinutes ? formatMinutes(page) : `page ${page}`} of ${fmt(pages)}`}.</Text>
          <Button variant="ghost" title="Keep reading" onPress={toggleStopping} disabled={saving} />
        </View>
      ) : (
        <View style={styles.links}>
          {status === "STARTED" && <Button variant="ghost" title="Pause this book" disabled={saving} onPress={() => run({ action: "pause", ...place() })} />}
          <Button variant="ghost" title={"I’m not going to finish it"} disabled={saving} onPress={toggleStopping} />
        </View>
      ))}

      {(isClosed || finished || stopping) && (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 8 }}>
            <Text variant="label">Rating <Text variant="muted">· optional</Text></Text>
            <StarRating value={rating} onChange={setRating} disabled={saving} label="Your rating" />
          </View>
          <View style={{ gap: 8 }}>
            <TextField
              label="Review · optional"
              value={review}
              onChangeText={(t) => setReview(t.slice(0, REVIEW_MAX))}
              placeholder="What did you think?"
              multiline
              textAlignVertical="top"
              editable={!saving}
              style={{ minHeight: 120, paddingTop: 12 }}
            />
            <View style={styles.switchRow}>
              <Text>Contains spoilers</Text>
              <Switch value={reviewSpoiler} onValueChange={setReviewSpoiler} disabled={saving} trackColor={{ true: accent }} accessibilityLabel="Contains spoilers" />
            </View>
            <View style={styles.switchRow}>
              <Text>Only me</Text>
              <Switch value={reviewPrivate} onValueChange={setReviewPrivate} disabled={saving} trackColor={{ true: accent }} accessibilityLabel="Only me" />
            </View>
          </View>
          {canReportSpice && <SpicePicker value={spice} onChange={setSpice} disabled={saving} />}
        </View>
      )}

      {showHistory && (
        <View style={{ gap: 6 }}>
          <Text variant="label">Reading history</Text>
          {history.map((read) => (
            <View key={read.id} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.sansMedium }}>
                  {read.status === "COMPLETED" ? "Finished"
                    : read.status === "DNF" ? `Did not finish${read.currentPercent != null ? ` · ${Math.round(read.currentPercent)}%` : read.stoppedAtMinute !== null ? ` · ${formatMinutes(read.stoppedAtMinute)}` : read.stoppedAtPage !== null ? ` · page ${read.stoppedAtPage}` : ""}`
                    : read.status === "PAUSED" ? "Paused" : "Reading now"}
                </Text>
                <Text variant="small">
                  {read.startedAt && read.finishedAt ? `${formatDay(read.startedAt)} – ${formatDay(read.finishedAt)}`
                    : read.startedAt ? `Started ${formatDay(read.startedAt)}` : read.finishedAt ? formatDay(read.finishedAt) : "No dates"}
                </Text>
              </View>
              {read.rating ? <StarRating value={read.rating} size={14} label="Rating" /> : null}
            </View>
          ))}
        </View>
      )}

      <View style={{ gap: 10, marginTop: 8 }}>
        {showPrimary && <Button title={primaryLabel} loading={saving} disabled={!canSave} onPress={save} />}
        {isClosed && <Button title="Read again" variant="outline" disabled={saving} onPress={() => run({ action: "restart" })} />}
        {(status === "DNF" || status === "NOT_INTERESTED") && <Button title="Move to Want to read" variant="outline" disabled={saving} onPress={() => run({ action: "wantToRead" })} />}
        {status === "NOT_STARTED" && <Button title="Move to Will not read" variant="ghost" disabled={saving} onPress={() => run({ action: "notInterested" })} />}
      </View>

      <BookSeriesSection bookId={book.id} accent={accent} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bookRow: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  numberRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  bigNumber: { fontSize: 44, minWidth: 64, borderBottomWidth: 2, paddingHorizontal: 4, paddingVertical: 0 },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  quickRow: { flexDirection: "row", gap: 8 },
  quick: { minWidth: 56, minHeight: 40, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});

// "Book 2 of The Empyrean" under the title. Nothing when the book isn't in a series.
function BookSeriesPlace({ bookId }: { bookId: string }) {
  const { data } = useSWR<BookSeries>(bookSeriesKey(bookId));
  const series = data?.series;
  if (!series) return null;
  return <Text variant="small">{seriesPlaceLabel(series.name, series.position)}</Text>;
}

// "In this series": the series' books in order and Follow series (one request, shared with the line above).
// A server from before the section sends no books, so it falls back to Follow series alone.
function BookSeriesSection({ bookId, accent }: { bookId: string; accent: string }) {
  const { data } = useSWR<BookSeries>(bookSeriesKey(bookId));
  const series = data?.series;
  if (!series) return null;
  if (!series.track) return <FollowSeries name={series.name} author={series.author} following={series.isFollowing} refreshKey={bookSeriesKey(bookId)} />;
  return <SeriesSection track={series.track} workId={series.workId ?? null} position={series.position} refreshKey={bookSeriesKey(bookId)} accent={accent} />;
}
