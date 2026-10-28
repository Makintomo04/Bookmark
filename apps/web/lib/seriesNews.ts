import type { Prisma } from "@prisma/client"
import prisma from "@/lib/db"
import { createNotifications } from "@/lib/notifications"
import { seriesKey } from "@/lib/series"

// Telling readers when a new book comes out in a series they follow or have started. Each series Hardcover
// knows is remembered as a SeriesCheck with the furthest book seen so far; a released book past it is new.
// New books are found two ways: when a work's series is filled (lib/seriesFill.ts), and by the weekly
// re-check (lib/seriesRecheck.ts, run by app/api/cron/series), which is what catches a book released after
// its series was first filled.
//
// The first time a series is seen nobody is told: the books already out are its back catalogue, not news.

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
// of them as the one named. Readers told about a book already (`alreadyTold`, "<userId>|<workId>") aren't
// told again. No database.
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
    const fresh = inOrder.filter((w) => !shelved.has(`${userId}|${w.id}`) && !alreadyTold.has(`${userId}|${w.id}`))
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
    select: { id: true, seriesName: true, seriesPosition: true, authors: true },
    take: 500,
  })
  return works.filter((w) => w.seriesName && w.authors[0] && seriesKey(w.seriesName, w.authors[0]) === series.key)
}

// Tells the series' followers and readers about its books placed after `after`. Returns how many were told.
export async function announceSeriesBooks(series: SeriesId, after: number): Promise<number> {
  const works = await seriesWorks(series)
  const newWorks = works.flatMap((w) => (w.seriesPosition != null && w.seriesPosition > after && Number.isInteger(w.seriesPosition)
    ? [{ id: w.id, position: w.seriesPosition }]
    : []))
  if (newWorks.length === 0) return 0
  const [follows, shelf, told] = await Promise.all([
    prisma.seriesFollow.findMany({ where: { seriesKey: series.key }, select: { userId: true } }),
    prisma.book.findMany({ where: { workId: { in: works.map((w) => w.id) } }, select: { userId: true, workId: true, status: true, timesRead: true } }),
    prisma.notification.findMany({ where: { type: "NEW_IN_SERIES", workId: { in: newWorks.map((w) => w.id) } }, select: { userId: true, workId: true } }),
  ])
  const rows = seriesNewsNotifications({
    followers: follows.map((f) => f.userId),
    shelf: shelf.map((b) => ({ ...b, workId: b.workId! })),
    newWorks,
    alreadyTold: new Set(told.map((n) => `${n.userId}|${n.workId}`)),
  })
  await createNotifications(rows)
  return rows.length
}

// Remembers what Hardcover said about a series, keeping the furthest book ever seen, and tells readers
// about any books past what was known before. Never told on the series' first sighting, or with `announce`
// off (a series Hardcover has only just found, whose "new" books may be years old). A null id is a series
// Hardcover doesn't know, recorded from the catalogue's books so the cron can look it up again.
export async function recordSeriesCheck(
  series: SeriesId,
  hardcoverSeriesId: number | null,
  positions: (number | null | undefined)[],
  { checkedAt = new Date(), announce = true }: { checkedAt?: Date, announce?: boolean } = {},
) {
  const before = await prisma.seriesCheck.findUnique({ where: { seriesKey: series.key }, select: { highestPosition: true } })
  const seen = highestPosition(positions)
  const highest = before?.highestPosition != null && (seen == null || before.highestPosition > seen) ? before.highestPosition : seen
  await prisma.seriesCheck.upsert({
    where: { seriesKey: series.key },
    create: { seriesKey: series.key, name: series.name, author: series.author, hardcoverSeriesId, highestPosition: highest, checkedAt },
    update: { ...(hardcoverSeriesId != null && { hardcoverSeriesId }), highestPosition: highest, checkedAt },
  })
  if (!announce || before?.highestPosition == null || highest == null || highest <= before.highestPosition) return 0
  return announceSeriesBooks(series, before.highestPosition)
}
