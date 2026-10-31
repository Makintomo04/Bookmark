import prisma from "@/lib/db";
import { workIdsWithPages } from "@/lib/workPages";
import type { Book, EditionFormat } from "@prisma/client";

// A book row with its edition's format, as /api/books and /api/books/[bookId] load it.
export const withFormat = { edition: { select: { format: true } } } as const;

// Books as the shelf shows them: the blurb left out, and who recommended each, its page and its series place added.
export async function shelfBooks(rows: (Book & { edition: { format: EditionFormat | null } | null })[]) {
const books = rows.map(({ edition, description, ...b }) => ({ ...b, format: edition?.format ?? null }))
// "Recommended by" is shown to the reader only: a Bookmark user by @username, otherwise the name they typed.
const recommenderIds = Array.from(new Set(books.flatMap((b) => (b.recommendedById ? [b.recommendedById] : []))))
const recommenders = recommenderIds.length > 0
  ? await prisma.user.findMany({ where: { id: { in: recommenderIds } }, select: { id: true, username: true } })
  : []
const usernameById = new Map(recommenders.map((u) => [u.id, u.username]))
// A book without an Open Library key links to its page by catalogue Work id, when the work has one (bookHref).
const withPages = await workIdsWithPages(books.map((b) => (b.workKey ? null : b.workId)))
// Where each book sits in its series, when the catalogue knows (the badge on an Up next cover).
const workIds = Array.from(new Set(books.flatMap((b) => (b.workId ? [b.workId] : []))))
const placed = workIds.length > 0
  ? await prisma.work.findMany({ where: { id: { in: workIds }, seriesPosition: { not: null } }, select: { id: true, seriesPosition: true } })
  : []
const positionByWork = new Map(placed.map((w) => [w.id, w.seriesPosition]))
return books.map((b) => {
  const username = b.recommendedById ? usernameById.get(b.recommendedById) : null
  const pageWorkId = !b.workKey && b.workId && withPages.has(b.workId) ? b.workId : null
  return { ...b, recommendedBy: username ? `@${username}` : b.recommendedByName ?? null, pageWorkId, seriesPosition: (b.workId && positionByWork.get(b.workId)) || null }
})
}

// The book a reader is reading is a re-read: restarted (timesRead survives a restart), or an earlier copy of the
// same title and author sits on Finished (the shelf's isRereading, asked of the database instead of the whole shelf).
export async function rereadingIds(userId: string, reading: Pick<Book, "id" | "title" | "author" | "timesRead">[]) {
  if (reading.length === 0) return new Set<string>();
  const same = (s: string) => s.trim().toLowerCase();
  const finished = await prisma.book.findMany({
    where: { userId, status: "COMPLETED", title: { in: reading.map((b) => b.title), mode: "insensitive" } },
    select: { id: true, title: true, author: true },
  });
  return new Set(reading.filter((b) => b.timesRead > 0
    || finished.some((f) => f.id !== b.id && same(f.title) === same(b.title) && same(f.author) === same(b.author))).map((b) => b.id));
}
