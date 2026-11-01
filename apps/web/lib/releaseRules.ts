import { isUpcoming, releaseYear } from "@bookmark/shared/releases";
import { seriesKey } from "@bookmark/shared/series";

// Who hears that a book is out on publication day (lib/jobs/publicationDay.ts), kept apart from the job so
// the tests load it without the database.

export interface ShelfCopy {
  userId: string;
  status: string;
}

// Who hears a book is out: Want to read, and followers of its author or series who haven't already got it
// some other way (reading an advance copy, finished, set aside, or marked not interested). No database.
export function publicationDayReaders({ shelf, followers, recentlyTold = new Set() }: { shelf: ShelfCopy[]; followers: string[]; recentlyTold?: Set<string> }): string[] {
  const wants = new Set<string>();
  const has = new Set<string>();
  for (const copy of shelf) (copy.status === "NOT_STARTED" ? wants : has).add(copy.userId);
  for (const userId of followers) if (!has.has(userId)) wants.add(userId);
  return Array.from(wants).filter((userId) => !has.has(userId) && !recentlyTold.has(userId));
}

// A release date only counts as one when it's in the book's first year (or the year isn't known): a
// reissue's date isn't publication day.
export const isFirstRelease = (work: { releaseDate: string; firstPublishYear: number | null }) =>
  work.firstPublishYear == null || work.firstPublishYear === releaseYear(work.releaseDate);

// One book, at most one heads-up (a new book announced, or new in a series), plus its publication day.
// Each alert checks the others before telling a reader, so a series follower who heard a book was
// announced isn't told again that it's new in the series, and nobody hears a book is new after it's out.
export const HEADS_UP_TYPES = ["NEW_BOOK", "NEW_IN_SERIES"] as const;
export const BOOK_NEWS_TYPES = [...HEADS_UP_TYPES, "PUBLICATION_DAY"] as const;

export interface BookNewsRow {
  type: string;
  workId: string | null;
  count: number | null;
}

// The weekly email's book news (lib/jobs/weeklyDigest.ts): up to `max` books per section, newest first, and
// each book in one section only. Out this week beats new in a series, which beats announced, so a book
// announced and out in the same week is said once, as out. No database.
export function bookNewsSections<W extends { id: string }>(news: BookNewsRow[], workById: Map<string, W>, max = 5) {
  const seen = new Set<string>();
  const section = (type: string) => {
    const out: { work: W; count: number | null }[] = [];
    for (const n of news) {
      const work = n.type === type && n.workId ? workById.get(n.workId) : undefined;
      if (!work || seen.has(work.id) || out.length >= max) continue;
      seen.add(work.id);
      out.push({ work, count: n.count });
    }
    return out;
  };
  const released = section("PUBLICATION_DAY");
  const series = section("NEW_IN_SERIES");
  const newBooks = section("NEW_BOOK");
  return { released, series, newBooks };
}

// A librarian's release date is announced ("New from <author>", lib/authorNews.ts announceDatedByHand) when it
// makes the book one still to come: it had no date, or one already past. Moving one future date to another
// isn't news again. No database.
export const newlyUpcoming = (before: string | null | undefined, after: string | null | undefined, today: string) =>
  isUpcoming(after, today) && !isUpcoming(before, today);

// A book's place in its series, as the series fill records it (lib/seriesFill.ts): none while it's not out,
// so it isn't the tracker's "next" and its series' readers aren't told it's out before it is. No database.
export const placeWhileUpcoming = (position: number | null, releaseDate: string | null | undefined, today: string) =>
  isUpcoming(releaseDate, today) ? null : position;

// The places a series fill or re-check records as the series' (lib/seriesNews.ts recordSeriesCheck): every
// book's but those lib/seriesFill.ts fileSeriesBooks held back as not out yet. No database.
export const placedPositions = (books: { position: number }[], held: Set<number>) => books.map((b) => b.position).filter((p) => !held.has(p));

// Whether a catalogue work takes a place Hardcover gives for a series' book (lib/seriesFill.ts
// fileSeriesBooks): one with no series yet, or one filed in this series without a place (announced before it
// was out). Never a series a librarian set. No database.
export function takesSeriesPlace(had: { seriesName: string | null; seriesPosition: number | null; curatedFields: string[] }, name: string, author: string): boolean {
  if (had.curatedFields.includes("seriesName")) return false;
  if (!had.seriesName) return true;
  return had.seriesPosition == null && seriesKey(had.seriesName, author) === seriesKey(name, author);
}

// What lib/seriesFill.ts fileSeriesBooks does with a catalogue work Hardcover lists as one of a series' books:
// whether it takes the place (takesSeriesPlace), the place it gets, and whether that place is held back from
// the series' highest book because the book isn't out by either date. A work whose series a librarian set
// keeps it, place and all, but its place is still held back, so nobody hears it's new in the series early.
// No database.
export function companionPlace(
  had: { seriesName: string | null; seriesPosition: number | null; curatedFields: string[]; releaseDate: string | null },
  book: { position: number; releaseDate?: string | null },
  name: string, author: string, today: string,
): { takes: boolean; position: number | null; held: boolean } {
  const position = placeWhileUpcoming(placeWhileUpcoming(book.position, had.releaseDate, today), book.releaseDate, today);
  return { takes: takesSeriesPlace(had, name, author), position, held: position == null };
}
