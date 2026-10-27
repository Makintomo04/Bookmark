import type { Prisma } from "@prisma/client"
import prisma from "@/lib/db"
import type { Author } from "@/lib/authors"
import { authorSlug } from "@/lib/authorNames"
import { buildTrack, sameSeriesName, seriesKey, type SeriesShelfBook, type SeriesTrack, type SeriesWork } from "@/lib/series"

// Following a series, and the series tracker on the reader's shelf (the rules are in
// packages/shared/src/series.ts). Free for everyone, never gated. A series is only followable once the
// catalog has a work in it, so the name and author always point at something real.

export interface SeriesRef {
  key: string
  name: string
  author: string
}

export interface FollowedSeries extends SeriesRef {
  followedAt: string
}

// A work's series, credited to its first author.
export function seriesOf(work: { seriesName: string | null, authors: string[] }): SeriesRef | null {
  const author = work.authors[0]
  if (!work.seriesName || !author) return null
  return { key: seriesKey(work.seriesName, author), name: work.seriesName, author }
}

// Catalog works of these series names, any case. Callers filter by author (buildTrack does).
const SERIES_WORKS_MAX = 1000
async function worksNamed(names: string[]): Promise<SeriesWork[]> {
  const unique = Array.from(new Map(names.map((n) => [n.toLowerCase(), n])).values())
  if (unique.length === 0) return []
  const rows = await prisma.work.findMany({
    where: { OR: unique.map((name) => ({ seriesName: { equals: name, mode: "insensitive" as const } })) },
    select: { id: true, openLibraryKey: true, hardcoverId: true, title: true, authors: true, coverUrl: true, seriesName: true, seriesPosition: true },
    take: SERIES_WORKS_MAX,
  })
  return rows.flatMap((w) => (w.seriesName
    ? [{ id: w.id, workKey: w.openLibraryKey, title: w.title, authors: w.authors, coverUrl: w.coverUrl, seriesName: w.seriesName, seriesPosition: w.seriesPosition, hardcoverId: w.hardcoverId }]
    : []))
}

// The series as the catalog spells it, or null when no work by this author carries that name.
export async function findSeries(name: string, author: string): Promise<SeriesRef | null> {
  const slug = authorSlug(author)
  const work = (await worksNamed([name])).find((w) => sameSeriesName(w.seriesName, name) && w.authors.some((a) => authorSlug(a) === slug))
  return work ? { key: seriesKey(work.seriesName, author), name: work.seriesName, author: work.authors.find((a) => authorSlug(a) === slug)! } : null
}

export async function isFollowingSeries(userId: string, key: string) {
  const row = await prisma.seriesFollow.findUnique({ where: { userId_seriesKey: { userId, seriesKey: key } }, select: { id: true } })
  return !!row
}

// Following and unfollowing set the state rather than toggle it, so a retried request can't undo itself.
export async function setFollowingSeries(userId: string, series: SeriesRef, following: boolean) {
  if (following) {
    await prisma.seriesFollow.upsert({
      where: { userId_seriesKey: { userId, seriesKey: series.key } },
      create: { userId, seriesKey: series.key, name: series.name, author: series.author },
      update: { name: series.name, author: series.author },
    })
  } else {
    await prisma.seriesFollow.deleteMany({ where: { userId, seriesKey: series.key } })
  }
}

export async function followedSeries(userId: string): Promise<FollowedSeries[]> {
  const rows = await prisma.seriesFollow.findMany({
    where: { userId },
    select: { seriesKey: true, name: true, author: true, createdAt: true },
    orderBy: { name: "asc" },
  })
  return rows.map((r) => ({ key: r.seriesKey, name: r.name, author: r.author, followedAt: r.createdAt.toISOString() }))
}

const latest = (...dates: (Date | null)[]) => {
  const times = dates.filter((d): d is Date => !!d).map((d) => d.getTime())
  return times.length ? new Date(Math.max(...times)).toISOString() : null
}

// The reader's series tracker: every series they've started or follow, with its books in order and the
// next one to read. A series only on their Want to read shelf, and not followed, is left out.
const SHELF_SELECT = { id: true, workId: true, status: true, timesRead: true, coverImage: true, startedAt: true, completedAt: true, progressAt: true } as const

const shelfBooks = (books: Prisma.BookGetPayload<{ select: typeof SHELF_SELECT }>[]): SeriesShelfBook[] => books.map((b) => ({
  bookId: b.id,
  workId: b.workId!,
  status: b.status,
  timesRead: b.timesRead,
  coverImage: b.coverImage || null,
  activeAt: latest(b.startedAt, b.completedAt, b.progressAt),
}))

export async function seriesTracker(userId: string): Promise<SeriesTrack[]> {
  const [books, follows] = await Promise.all([
    prisma.book.findMany({ where: { userId, workId: { not: null } }, select: SHELF_SELECT }),
    followedSeries(userId),
  ])
  const shelvedWorks = books.length
    ? await prisma.work.findMany({ where: { id: { in: books.map((b) => b.workId!) } }, select: { seriesName: true, authors: true } })
    : []

  const refs = new Map<string, SeriesRef>()
  for (const w of shelvedWorks) {
    const ref = seriesOf(w)
    if (ref && !refs.has(ref.key)) refs.set(ref.key, ref)
  }
  // A follow keeps the name it was followed under.
  for (const f of follows) refs.set(f.key, f)
  if (refs.size === 0) return []

  const works = await worksNamed(Array.from(refs.values()).map((r) => r.name))
  const shelf = shelfBooks(books)
  const followed = new Set(follows.map((f) => f.key))

  return Array.from(refs.values())
    .map((ref) => buildTrack(ref, works, shelf, followed.has(ref.key)))
    .filter((t) => t.entries.length > 0 && (t.started || t.following))
}

// One series on a book page ("In this series"): its books in order, marked with where the viewer has them
// when signed in, and whether they follow it.
export async function seriesOnPage(series: { name: string, author: string }, userId: string | null): Promise<SeriesTrack> {
  const works = await worksNamed([series.name])
  const [books, following] = userId
    ? await Promise.all([
      prisma.book.findMany({ where: { userId, workId: { in: works.map((w) => w.id) } }, select: SHELF_SELECT }),
      isFollowingSeries(userId, seriesKey(series.name, series.author)),
    ])
    : [[], false]
  return buildTrack(series, works, shelfBooks(books), following)
}

// The series of the reader's copy of a book, whether they follow it, and its books with where the reader
// has them (the app's book screen, "In this series").
export async function seriesForBook(userId: string, bookId: string) {
  const book = await prisma.book.findFirst({ where: { id: bookId, userId }, select: { workId: true } })
  if (!book?.workId) return null
  const work = await prisma.work.findUnique({ where: { id: book.workId }, select: { seriesName: true, seriesPosition: true, authors: true } })
  const ref = work && seriesOf(work)
  if (!ref) return null
  const track = await seriesOnPage(ref, userId)
  return { ...ref, workId: book.workId, position: work.seriesPosition, isFollowing: track.following, track }
}

export interface AuthorSeries extends SeriesRef {
  // Books of it in the catalog.
  count: number
  isFollowing: boolean
}

// The series an author writes, from the catalog, A to Z, each with whether the reader follows it.
export async function authorSeries(author: Author, userId: string | null): Promise<AuthorSeries[]> {
  const works = await prisma.work.findMany({
    where: { OR: [...(author.key ? [{ authorKeys: { has: author.key } }] : []), { authors: { has: author.name } }] },
    select: { seriesName: true, authors: true },
    take: 500,
  })
  const found = new Map<string, SeriesRef & { count: number }>()
  for (const w of works) {
    // Keyed by the first author, as on the book page, so both follow the same series.
    const ref = seriesOf(w)
    if (!ref) continue
    const had = found.get(ref.key)
    found.set(ref.key, had ? { ...had, count: had.count + 1 } : { ...ref, count: 1 })
  }
  const list = Array.from(found.values()).sort((a, b) => a.name.localeCompare(b.name))
  if (list.length === 0) return []
  const following = userId
    ? new Set((await prisma.seriesFollow.findMany({ where: { userId, seriesKey: { in: list.map((s) => s.key) } }, select: { seriesKey: true } })).map((r) => r.seriesKey))
    : new Set<string>()
  return list.map((s) => ({ ...s, isFollowing: following.has(s.key) }))
}
