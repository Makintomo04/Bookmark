import type { Prisma } from "@prisma/client"
import prisma from "@/lib/db"
import { createNotifications } from "@/lib/notifications"
import { BOOK_NEWS_TYPES } from "@/lib/releaseRules"
import { isUpcoming } from "@bookmark/shared/releases"
import { seriesKey } from "@/lib/series"

// Telling readers when a new book comes out in a series they follow or have started. Each series Hardcover
// knows is remembered as a SeriesCheck with the furthest book seen so far; a released book past it is new.
// New books are found two ways: when a work's series is filled (lib/seriesFill.ts), and by the weekly
// re-check (lib/seriesRecheck.ts, run by app/api/cron/series), which is what catches a book released after
// its series was first filled. Either way readers are told by the cron, in batches.
//
// The first time a series is seen nobody is told: the books already out are its back catalogue, not news.
// Nor is a reader who already heard of the book another way: announced (NEW_BOOK) or out today
// (PUBLICATION_DAY). See lib/releaseRules.ts BOOK_NEWS_TYPES.

export interface SeriesId {
  key: string
  name: string
  author: string
}

// A book the reader is reading, has read, or has put on hold. A DNF alone doesn't count: they stopped, so
// a sequel isn't news to them unless they follow the series.
const STARTED = new Set(["STARTED", "COMPLETED", "PAUSED"])

export interface SeriesShelfRow {
  userId: string
  workId: string
  status: string
  timesRead: number
}

export interface NewSeriesWork {
  id: string
  position: number
}

// One notification per reader for the series: its new books they haven't shelved, counted, with the first
// of them as the one named. A reader told about any of these books already (`alreadyTold`,
// "<userId>|<workId>") isn't told again: a notification names only the first of the books it counts, so
// being told about one is taken as being told about them all. No database.
export function seriesNewsNotifications({ followers, shelf, newWorks, alreadyTold = new Set() }: {
  followers: string[]
  // Every copy of the series' books, the new ones included.
  shelf: SeriesShelfRow[]
  newWorks: NewSeriesWork[]
  alreadyTold?: Set<string>
}): Prisma.NotificationUncheckedCreateInput[] {
  const newIds = new Set(newWorks.map((w) => w.id))
  const readers = new Set(followers)
  const shelved = new Set<string>()
  for (const row of shelf) {
    if (newIds.has(row.workId)) shelved.add(`${row.userId}|${row.workId}`)
    else if (STARTED.has(row.status) || row.timesRead > 0) readers.add(row.userId)
  }
  const inOrder = [...newWorks].sort((a, b) => a.position - b.position)
  return Array.from(readers).flatMap((userId) => {
    if (newWorks.some((w) => alreadyTold.has(`${userId}|${w.id}`))) return []
    const fresh = inOrder.filter((w) => !shelved.has(`${userId}|${w.id}`))
    if (fresh.length === 0) return []
    return [{ userId, actorId: userId, type: "NEW_IN_SERIES" as const, workId: fresh[0].id, count: fresh.length }]
  })
}

// The furthest whole-numbered place among a series' books.
export const highestPosition = (positions: (number | null | undefined)[]) => {
  const whole = positions.filter((p): p is number => typeof p === "number" && Number.isInteger(p) && p >= 1)
  return whole.length ? Math.max(...whole) : null
}

// The series' catalogue works, credited to its author.
async function seriesWorks(series: SeriesId) {
  const works = await prisma.work.findMany({
    where: { seriesName: { equals: series.name, mode: "insensitive" } },
    select: { id: true, seriesName: true, seriesPosition: true, authors: true, releaseDate: true },
    take: 500,
  })
  return works.filter((w) => w.seriesName && w.authors[0] && seriesKey(w.seriesName, w.authors[0]) === series.key)
}

// Readers told per batch: one batch is a createMany and up to a few Expo requests, well inside a run.
export const ANNOUNCE_BATCH = 500

// Tells the series' followers and readers about its books placed after `after`, up to `limit` readers.
// Readers already told are skipped, so calling it again carries on where it stopped; `done` says nobody is
// left. A book the catalogue dates ahead is never announced as out, even with a place (a librarian's, or a later
// book raising the series' highest past it): telling readers early is worse than telling them late.
export async function announceSeriesBooks(series: SeriesId, after: number, limit = ANNOUNCE_BATCH): Promise<{ told: number, done: boolean }> {
  const works = await seriesWorks(series)
  const today = new Date().toISOString().slice(0, 10)
  const newWorks = works.flatMap((w) => (w.seriesPosition != null && w.seriesPosition > after && Number.isInteger(w.seriesPosition) && !isUpcoming(w.releaseDate, today)
    ? [{ id: w.id, position: w.seriesPosition }]
    : []))
  if (newWorks.length === 0) return { told: 0, done: true }
  const [follows, shelf, told] = await Promise.all([
    prisma.seriesFollow.findMany({ where: { seriesKey: series.key }, select: { userId: true } }),
    prisma.book.findMany({ where: { workId: { in: works.map((w) => w.id) } }, select: { userId: true, workId: true, status: true, timesRead: true } }),
    prisma.notification.findMany({ where: { type: { in: [...BOOK_NEWS_TYPES] }, workId: { in: newWorks.map((w) => w.id) } }, select: { userId: true, workId: true } }),
  ])
  const rows = seriesNewsNotifications({
    followers: follows.map((f) => f.userId),
    shelf: shelf.map((b) => ({ ...b, workId: b.workId! })),
    newWorks,
    alreadyTold: new Set(told.map((n) => `${n.userId}|${n.workId}`)),
  })
  await createNotifications(rows.slice(0, limit))
  return { told: Math.min(rows.length, limit), done: rows.length <= limit }
}

interface SeriesBefore {
  hardcoverSeriesId: number | null
  highestPosition: number | null
  announceAfter: number | null
}

// Where readers' news starts after a check that saw `highest`: books past the furthest known before are
// new. Nothing new when the series wasn't known from Hardcover before (its first sighting, or recorded
// from the catalogue alone, whose "new" books may be years old), with `announce` off, or when nothing is
// further on. An announcement already under way is kept. No database.
export function announceFrom(before: SeriesBefore | null, highest: number | null, announce = true): number | null {
  const pending = before?.announceAfter ?? null
  if (!announce || !before || before.hardcoverSeriesId == null || before.highestPosition == null) return pending
  if (highest == null || highest <= before.highestPosition) return pending
  return pending == null ? before.highestPosition : Math.min(pending, before.highestPosition)
}

// Remembers what Hardcover said about a series, keeping the furthest book ever seen. Books past what was
// known before are queued for their readers (announceAfter), and the cron tells them in batches
// (sendSeriesNews), so a series with thousands of readers never holds up the request that found the book.
// A null id is a series Hardcover doesn't know, recorded from the catalogue's books so the cron can look it
// up again. Returns whether new books were queued.
export async function recordSeriesCheck(
  series: SeriesId,
  hardcoverSeriesId: number | null,
  positions: (number | null | undefined)[],
  { checkedAt = new Date(), announce = true }: { checkedAt?: Date, announce?: boolean } = {},
): Promise<boolean> {
  const before = await prisma.seriesCheck.findUnique({ where: { seriesKey: series.key }, select: { hardcoverSeriesId: true, highestPosition: true, announceAfter: true } })
  const seen = highestPosition(positions)
  const highest = before?.highestPosition != null && (seen == null || before.highestPosition > seen) ? before.highestPosition : seen
  const announceAfter = announceFrom(before, highest, announce)
  await prisma.seriesCheck.upsert({
    where: { seriesKey: series.key },
    create: { seriesKey: series.key, name: series.name, author: series.author, hardcoverSeriesId, highestPosition: highest, checkedAt },
    update: { ...(hardcoverSeriesId != null && { hardcoverSeriesId }), highestPosition: highest, announceAfter, checkedAt },
  })
  return announceAfter !== (before?.announceAfter ?? null)
}

// Tells readers about the series' queued new books, a batch at a time, until `deadline` (ms since the
// epoch). A series whose readers have all been told is cleared; the rest carry on at the next run.
export async function sendSeriesNews({ deadline }: { deadline: number }): Promise<{ told: number, announcing: number }> {
  const queued = await prisma.seriesCheck.findMany({
    where: { announceAfter: { not: null } },
    select: { id: true, seriesKey: true, name: true, author: true, announceAfter: true },
  })
  let told = 0
  let announcing = 0
  for (const s of queued) {
    let done = false
    try {
      while (!done && Date.now() < deadline) {
        const batch = await announceSeriesBooks({ key: s.seriesKey, name: s.name, author: s.author }, s.announceAfter!)
        told += batch.told
        done = batch.done
      }
    } catch (err) {
      // Left queued; readers not yet told are told next run.
      console.warn(`series news: couldn't tell readers of "${s.name}":`, err instanceof Error ? err.message : err)
    }
    // Only if no newer check moved it meanwhile.
    if (done) await prisma.seriesCheck.updateMany({ where: { id: s.id, announceAfter: s.announceAfter }, data: { announceAfter: null } })
    else announcing++
  }
  return { told, announcing }
}
