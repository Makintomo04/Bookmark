import prisma from "@/lib/db";
import { getAchievementTitle } from "@/lib/achievements-catalog";
import type { Book, Status } from "@prisma/client";

// Bump when the JSON shape changes incompatibly, so an importer can branch on it.
export const EXPORT_VERSION = 1;

// Goodreads "Exclusive Shelf" values. Most apps that import a Goodreads CSV recognise these three.
export type ExclusiveShelf = "to-read" | "currently-reading" | "read";

// Typed over the whole Status enum: adding a status to the schema fails the build here until it's mapped.
export const SHELF_BY_STATUS: Record<Status, ExclusiveShelf | string> = {
  NOT_STARTED: "to-read",
  STARTED: "currently-reading",
  COMPLETED: "read",
  // Goodreads has no built-in shelf for these. StoryGraph's Goodreads importer reads
  // "did-not-finish", and Goodreads users commonly shelve paused books as "paused".
  DNF: "did-not-finish",
  PAUSED: "paused",
  NOT_INTERESTED: "not-interested",
};

export function shelfForStatus(status: Status): string {
  return SHELF_BY_STATUS[status] ?? "to-read";
}

// Goodreads writes dates as YYYY/MM/DD.
function goodreadsDate(date: Date | null | undefined) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
}

// "Ursula K. Le Guin" → "Guin, Ursula K. Le". Same naive last-word split Goodreads uses.
function authorLastFirst(author: string) {
  const parts = author.trim().split(/\s+/);
  if (parts.length < 2) return author.trim();
  const last = parts.pop();
  return `${last}, ${parts.join(" ")}`;
}

type ExportBook = Pick<
  Book,
  | "id" | "title" | "author" | "pages" | "currentPage" | "rating" | "review" | "timesRead"
  | "status" | "genre" | "createdAt" | "startedAt" | "completedAt" | "workKey" | "coverImage"
> & {
  // The catalog edition the book is filed under (null until the backfill has run for it).
  edition?: { isbn10: string | null; isbn13: string | null } | null;
};

type Column = { header: string; value: (book: ExportBook, ctx: { favouriteIds: Set<string> }) => string | number };

// Goodreads-named columns first (in Goodreads' own order), then Bookmark-only columns.
// Keep headers stable: the importer matches on them to round-trip an export.
export const CSV_COLUMNS: Column[] = [
  { header: "Title", value: (b) => b.title },
  { header: "Author", value: (b) => b.author },
  { header: "Author l-f", value: (b) => authorLastFirst(b.author) },
  // Plain digits, not Goodreads' ="…" formula guard: every importer reads these, and the guard is one
  // of the things that breaks Goodreads files elsewhere.
  { header: "ISBN", value: (b) => b.edition?.isbn10 ?? "" },
  { header: "ISBN13", value: (b) => b.edition?.isbn13 ?? "" },
  // Goodreads ratings are whole stars, 0 meaning unrated. The exact value is in "Bookmark Rating".
  { header: "My Rating", value: (b) => (b.rating ? Math.round(b.rating) : 0) },
  { header: "Number of Pages", value: (b) => b.pages ?? "" },
  { header: "Date Read", value: (b) => goodreadsDate(b.completedAt) },
  { header: "Date Added", value: (b) => goodreadsDate(b.createdAt) },
  { header: "Bookshelves", value: (b, ctx) => (ctx.favouriteIds.has(b.id) ? "favourites" : "") },
  { header: "Exclusive Shelf", value: (b) => shelfForStatus(b.status) },
  { header: "My Review", value: (b) => b.review ?? "" },
  { header: "Read Count", value: (b) => b.timesRead ?? 0 },
  { header: "Bookmark Rating", value: (b) => b.rating ?? "" },
  { header: "Date Started", value: (b) => goodreadsDate(b.startedAt) },
  { header: "Current Page", value: (b) => b.currentPage ?? 0 },
  { header: "Genre", value: (b) => b.genre ?? "" },
  { header: "Favourite", value: (b, ctx) => (ctx.favouriteIds.has(b.id) ? "true" : "false") },
  { header: "Bookmark Status", value: (b) => b.status },
  { header: "Open Library Work Key", value: (b) => b.workKey ?? "" },
  { header: "Cover Image", value: (b) => b.coverImage ?? "" },
  { header: "Bookmark Id", value: (b) => b.id },
];

// RFC 4180: quote a field holding a comma, quote or line break, and double any quotes inside it.
export function csvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function booksToCsv(books: ExportBook[], favouriteIds: string[]): string {
  const ctx = { favouriteIds: new Set(favouriteIds) };
  const rows = [
    CSV_COLUMNS.map((c) => csvField(c.header)).join(","),
    ...books.map((b) => CSV_COLUMNS.map((c) => csvField(c.value(b, ctx))).join(",")),
  ];
  return rows.join("\r\n") + "\r\n";
}

export async function loadBooks(userId: string) {
  return prisma.book.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { edition: { select: { isbn10: true, isbn13: true } } },
  });
}

export async function buildJsonExport(userId: string) {
  const [user, books, readingGoals, lists, follows, authorFollows, seriesFollows, achievements] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, name: true, username: true, email: true, emailVerified: true, bio: true,
        image: true, banner: true, favColour: true, favGenres: true, favouriteIds: true,
        createdAt: true, updatedAt: true,
      },
    }),
    loadBooks(userId),
    prisma.readingGoal.findMany({ where: { userId }, orderBy: { year: "asc" }, select: { year: true, targetBooks: true, targetPages: true, targetBooksPerMonth: true, createdAt: true, updatedAt: true } }),
    prisma.list.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, title: true, description: true, visibility: true, genres: true, tags: true,
        createdAt: true, updatedAt: true,
        items: {
          orderBy: { position: "asc" },
          select: { workKey: true, title: true, author: true, coverUrl: true, pages: true, note: true, position: true, createdAt: true },
        },
      },
    }),
    prisma.follow.findMany({ where: { followerId: userId }, orderBy: { createdAt: "asc" }, select: { createdAt: true, following: { select: { username: true } } } }),
    prisma.authorFollow.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { authorKey: true, name: true, createdAt: true } }),
    prisma.seriesFollow.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { name: true, author: true, createdAt: true } }),
    prisma.userAchievement.findMany({ where: { userId }, orderBy: { earnedAt: "asc" }, select: { key: true, earnedAt: true } }),
  ]);

  const notes = books.length
    ? await prisma.note.findMany({
        where: { bookId: { in: books.map((b) => b.id) } },
        orderBy: { createdAt: "asc" },
        select: { id: true, bookId: true, title: true, content: true, createdAt: true, updatedAt: true },
      })
    : [];

  const favouriteIds = new Set(user.favouriteIds);

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    user,
    books: books.map(({ userId: _owner, ...book }) => ({
      ...book,
      shelf: shelfForStatus(book.status),
      favourite: favouriteIds.has(book.id),
    })),
    notes,
    readingGoals,
    lists,
    follows: follows
      .filter((f) => f.following.username)
      .map((f) => ({ username: f.following.username as string, followedAt: f.createdAt })),
    followedAuthors: authorFollows.map((a) => ({ name: a.name, openLibraryKey: a.authorKey, followedAt: a.createdAt })),
    followedSeries: seriesFollows.map((s) => ({ name: s.name, author: s.author, followedAt: s.createdAt })),
    achievements: achievements.map((a) => ({ ...a, title: getAchievementTitle(a.key) })),
  };
}

export function exportFilename(username: string | null | undefined, ext: "json" | "csv") {
  const date = new Date().toISOString().slice(0, 10);
  const who = (username ?? "").replace(/[^a-zA-Z0-9_-]/g, "") || "me";
  return ext === "csv" ? `bookmark-books-${who}-${date}.csv` : `bookmark-export-${who}-${date}.json`;
}
