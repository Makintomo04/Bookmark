import useSWR, { mutate } from "swr";
import type { ProgressBook } from "@bookmark/shared/progress";
import { api } from "@/lib/api";
import type { EarnMoment } from "@bookmark/shared/earnMoment";
import type { AskReason } from "@bookmark/shared/reminders";
import { BULK_MAX } from "@bookmark/shared/bulkRules";
import { shelfParams, type ShelfFilter, type ShelfKey, type filterOptions } from "@bookmark/shared/shelfFilter";
import { celebrate } from "@/lib/earnMoment";
import { sameBook } from "@bookmark/shared/workKey";

// The reader's own shelf, from /api/books (the same list the web's useBooks reads), and the moves the
// book page makes through /api/book-progress.

export type Status = "NOT_STARTED" | "STARTED" | "COMPLETED" | "DNF" | "PAUSED" | "NOT_INTERESTED";

export interface Book extends ProgressBook {
  id: string;
  title: string;
  author: string;
  coverImage: string;
  cardColour: string | null;
  genre: string | null;
  status: Status;
  rating: number | null;
  review: string | null;
  reviewSpoiler: boolean | null;
  reviewPrivate: boolean | null;
  isPrivate?: boolean | null;
  timesRead: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  stoppedAt: string | null;
  workKey: string | null;
  recommendedBy: string | null;
}

export interface BookRead {
  id: string;
  status: Status;
  startedAt: string | null;
  finishedAt: string | null;
  rating: number | null;
  stoppedAtPage: number | null;
  stoppedAtMinute: number | null;
  // Set when the reader logged a percent (Kindle); a DNF then shows where they stopped as one.
  currentPercent?: number | null;
}

// The whole shelf. Only for what really needs every book (choosing a circle's book); the Library reads
// useLibrary and a book page useBook, so neither downloads a shelf of thousands.
export const useBooks = () => useSWR<Book[]>("/api/books");

// The reader's own copy of a book shown somewhere else (a list, the first-book picker), so its Add button can
// say it's on the shelf once it is: adding one refreshes useBooks. Null while the shelf loads, or if it isn't there.
export function useShelfCopy() {
  const { data } = useBooks();
  return (book: { title: string; author: string; workKey?: string | null }) => data?.find((own) => sameBook(own, book)) ?? null;
}

// The Library tab: the newest of each shelf (LIBRARY_PREVIEW books), how many each holds, and which books being
// read are re-reads (GET /api/books?shelves=). See all opens the rest, a page at a time.
export const LIBRARY_PREVIEW = 20;
export interface Library {
  shelves: Record<ShelfKey, Book[]>;
  counts: Record<ShelfKey, number>;
  rereading: string[];
}
export const useLibrary = () => useSWR<Library>(`/api/books?shelves=${LIBRARY_PREVIEW}`);

// One of your books, with its blurb and whether it's a re-read (GET /api/books/<id>).
export const useBook = (id: string | undefined) => useSWR<Book & { rereading?: boolean }>(id ? `/api/books/${encodeURIComponent(id)}` : null);

// What select mode keeps of each picked book: enough for SelectionBar's actions.
export type PickedBook = Pick<Book, "id" | "status" | "isPrivate">;
// Every book on one shelf, for Select all on a shelf the Library shows only the start of.
export const shelfSelection = (shelf: ShelfKey) => api.get<{ books: PickedBook[] }>(`/api/books?select=${shelf}`).then((d) => d.books);

// One page of the shelf, searched, sorted and filtered on the server (GET /api/books?take=…), for the shelf
// screen. The first page also carries the filter menus' options and how many books each shelf holds.
export type ShelfOptions = ReturnType<typeof filterOptions>;
export interface ShelfPage {
  books: Book[];
  total: number;
  nextCursor: string | null;
  options?: ShelfOptions;
  counts?: Record<ShelfKey, number>;
}

const SHELF_PAGE_SIZE = 60;

// useSWRInfinite's key for a filter: page after page until the server says there are no more. Your own shelf,
// or with `reader` another reader's Finished or Want to read (/api/users/<reader>/shelf, the same rules).
export const shelfPageKey = (filter: ShelfFilter, reader?: string | null) => (index: number, previous: ShelfPage | null) => {
  if (previous && !previous.nextCursor) return null;
  const params = shelfParams(filter);
  params.set("take", String(SHELF_PAGE_SIZE));
  if (previous?.nextCursor) params.set("cursor", previous.nextCursor);
  if (index === 0) params.set("facets", "1");
  return `${reader ? `/api/users/${encodeURIComponent(reader)}/shelf` : "/api/books"}?${params.toString()}`;
};

const time = (date: string | null) => (date ? new Date(date).getTime() : 0);
const same = (s: string) => s.trim().toLowerCase();

// The shelves in the web's order (app/components/books/shelf.tsx), newest first within each.
export function groupShelf(books: Book[]) {
  const on = (status: Status) => books.filter((b) => b.status === status);
  return {
    reading: on("STARTED").sort((a, b) => time(b.startedAt) - time(a.startedAt)),
    wantToRead: on("NOT_STARTED").sort((a, b) => time(b.createdAt) - time(a.createdAt)),
    finished: on("COMPLETED").sort((a, b) => time(b.completedAt) - time(a.completedAt)),
    paused: on("PAUSED").sort((a, b) => time(b.stoppedAt) - time(a.stoppedAt)),
    didNotFinish: on("DNF").sort((a, b) => time(b.stoppedAt) - time(a.stoppedAt)),
    notInterested: on("NOT_INTERESTED").sort((a, b) => time(b.createdAt) - time(a.createdAt)),
  };
}

// A book being read that was finished before: restarted, or an earlier copy is on Finished.
export function isRereading(book: Book, finished: Book[]) {
  if (book.timesRead > 0) return true;
  return finished.some((f) => f.id !== book.id && same(f.title) === same(book.title) && same(f.author) === same(book.author));
}

// Everything a book save can change (the web's refreshAfterBookChange).
export function refreshAfterBookChange() {
  return mutate((key) => typeof key === "string" && (key.startsWith("/api/books") || key.startsWith("/api/discover") || key === "/api/user" || key === "/api/achievements" || key === "/api/notifications" || key.startsWith("/api/reading-goal")));
}

export type BookAction = "start" | "progress" | "complete" | "rate" | "pause" | "resume" | "dnf" | "restart" | "wantToRead" | "notInterested";

// Celebrates whatever the save earned (lib/earnMoment.ts).
export async function saveBook(payload: { id: string; action: BookAction } & Record<string, unknown>) {
  const saved = await api.post<{ earnMoment?: EarnMoment | null; askReminders?: AskReason | false }>("/api/book-progress", payload);
  await refreshAfterBookChange();
  celebrate(saved?.earnMoment, saved?.askReminders);
}

// One action over any number of books: /api/books/bulk takes BULK_MAX at a time, so a bigger selection goes in
// batches, one after another, and the counts come back added together (the web's BulkBar does the same).
export async function bulkBooks(body: Record<string, unknown>, ids: string[]) {
  const total: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += BULK_MAX) {
    const data = await api.post<Record<string, unknown>>("/api/books/bulk", { ...body, ids: ids.slice(i, i + BULK_MAX) });
    for (const [key, value] of Object.entries(data ?? {})) if (typeof value === "number") total[key] = (total[key] ?? 0) + value;
  }
  await refreshAfterBookChange();
  return total;
}

// Saves return with the Open Library cover; copying it to our storage happens afterwards, unwaited.
export function copyCoverLater(bookId: string | undefined) {
  if (!bookId) return;
  api.post(`/api/books/${bookId}/cover`).then(() => refreshAfterBookChange()).catch(() => {});
}

export const SHELF_LABELS: Record<Status, string> = {
  STARTED: "Currently reading",
  NOT_STARTED: "Want to read",
  COMPLETED: "Finished",
  PAUSED: "Paused",
  DNF: "Did not finish",
  NOT_INTERESTED: "Will not read",
};

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const formatDay = (date: string) => dayFormat.format(new Date(date));
