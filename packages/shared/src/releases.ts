// Release dates (BOO-7) and the alerts about them (BOO-8): a new book by an author or in a series the
// reader follows, and the day a book they want comes out. Dates are "YYYY-MM-DD" days with no time zone,
// as Work.releaseDate and Edition.releaseDate store them, so they sort and compare as text. Alerts only
// ever say a book's title, its author and its date, never anything about what happens in it. No database
// imports: plain Node loads this for the tests.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const day = (year: number, month: number, date: number): string | null => {
  if (!(year >= 1000 && year < 3000 && month >= 1 && month <= 12 && date >= 1 && date <= 31)) return null;
  const d = new Date(Date.UTC(year, month - 1, date));
  // 31 April rolls over into May: not a real day.
  if (d.getUTCMonth() !== month - 1) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
};

const monthOf = (name: string) => {
  const n = name.toLowerCase().replace(/\.$/, "");
  if (n.length < 3) return 0;
  return MONTHS.findIndex((m) => m.toLowerCase().startsWith(n)) + 1;
};

// A full date from the ways Open Library and Hardcover write one: "2014-03-04", "March 4, 2014",
// "4 Mar 2014". Null for a year or month alone ("2014", "March 2014"), and for "03/04/2014", which could be
// either day first or month first.
export function releaseDateFrom(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[T\s])/);
  if (m) return day(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^([A-Za-z]+\.?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (m) return day(Number(m[3]), monthOf(m[1]), Number(m[2]));
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+\.?),?\s+(\d{4})$/);
  if (m) return day(Number(m[3]), monthOf(m[2]), Number(m[1]));
  return null;
}

// When a book first came out, from the publish dates of its editions: the earliest full date in its first
// year (`year`). Null when none of them gives a full date for that year, so a reprint's date is never taken.
export function firstReleaseDate(publishDates: (string | null | undefined)[], year: number | null | undefined): string | null {
  if (!year) return null;
  const days = publishDates.flatMap((d) => {
    const parsed = releaseDateFrom(d);
    return parsed && releaseYear(parsed) === year ? [parsed] : [];
  });
  return days.length ? days.sort()[0] : null;
}

// "9 April 2027", as en-GB writes it. Written out rather than left to Intl, so the app and the server
// can't disagree.
export function formatReleaseDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Not out yet on `today` (the reader's own day, "YYYY-MM-DD").
export const isUpcoming = (date: string | null | undefined, today: string) => !!date && date > today;

// The year a release date is in.
export const releaseYear = (date: string) => Number(date.slice(0, 4));

// A book's "First published" line: the full date when it's known, else the year, and "Coming out" for one
// not out yet. Null when neither is known.
export function publishedFact(book: { releaseDate?: string | null; year?: number | null }, today: string): { label: string; value: string } | null {
  if (book.releaseDate) return { label: isUpcoming(book.releaseDate, today) ? "Coming out" : "First published", value: formatReleaseDate(book.releaseDate) };
  return book.year ? { label: "First published", value: String(book.year) } : null;
}

export interface NewBookNews {
  title: string | null;
  author: string | null;
  releaseDate: string | null;
  // How many new books the alert stands for; the title is the first of them.
  count: number | null;
}

const titleOf = (title: string | null) => title ?? "A new book";
const byAuthor = (author: string | null) => (author ? ` by ${author}` : "");

// The bell and push line for NEW_BOOK: "The Familiar by Leigh Bardugo comes out on 9 April 2027".
export function newBookText(n: NewBookNews, today: string): string {
  const count = n.count ?? 1;
  if (count > 1) return `${count} new books${n.author ? ` from ${n.author}` : ""}, starting with ${titleOf(n.title)}`;
  const when = isUpcoming(n.releaseDate, today) ? `comes out on ${formatReleaseDate(n.releaseDate!)}` : "is out now";
  return `${titleOf(n.title)}${byAuthor(n.author)} ${when}`;
}

// The bell and push line for PUBLICATION_DAY: "The Familiar by Leigh Bardugo is out today".
export const publicationDayText = (n: { title: string | null; author: string | null }) => `${titleOf(n.title)}${byAuthor(n.author)} is out today`;

// The local time from which a publication-day alert is sent: 9am, the weekly email's hour.
export const PUBLICATION_DAY_MINUTE = 9 * 60;
