import prisma from "@/lib/db"
import { hardcoverConfigured, hardcoverSeriesBooks, hardcoverSeriesOf } from "@/lib/hardcover"
import { seriesKey } from "@/lib/series"
import { fileSeriesBooks } from "@/lib/seriesFill"
import { recordSeriesCheck, type SeriesId } from "@/lib/seriesNews"

// The daily cron's work (app/api/cron/series), in two parts:
//
// 1. The weekly re-check: asks Hardcover again about series someone follows or has started, a week or more
//    since they were last asked, files any book released since, and tells their readers (lib/seriesNews.ts).
//    A fill only ever asks about a work once, so without this a book that comes out later would only reach
//    the catalogue if someone happened to shelve it.
// 2. Recording series nobody had recorded: a series whose books were filled before new-book notifications
//    existed, or that nobody followed or read then, has no SeriesCheck, so the re-check doesn't know it.
//    Once someone follows it or is reading it, it's recorded here (nobody is told: its books are the
//    starting point).
//
// A re-check costs one Hardcover request, a recording four. Both are paced under Hardcover's 60 a minute
// and stop at a deadline, so a run fits in a serverless function; what's left goes first the next day.

export const RECHECK_AFTER_DAYS = 7
// Books read in this long are where newly started series are found. Followed series are found however
// long ago they were followed. scripts/backfill-series-checks.ts records the rest of history.
export const ACTIVE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
// Per Hardcover request, a little over its 60 a minute.
const PACE_MS = 1100
const LOOKUP_REQUESTS = 4
const STARTED = ["STARTED", "COMPLETED", "PAUSED"] as const
// A book that counts as reading the series: one being read, finished, on hold, or read before.
const startedWhere = { OR: [{ status: { in: [...STARTED] } }, { timesRead: { gt: 0 } }] }

export interface RecheckResult {
  checked: number
  // Due, but nobody follows or has started them: put back a week without asking Hardcover.
  passedOver: number
  newBooks: number
  told: number
  // Series recorded for the first time, and how many of those (or of re-checks) Hardcover didn't know.
  recorded: number
  notOnHardcover: number
  // Set when Hardcover failed and the run stopped early.
  stoppedBy?: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// The catalogue's works in these series, keyed by series.
async function worksBySeries(names: string[]) {
  const works = names.length
    ? await prisma.work.findMany({
      where: { seriesName: { in: Array.from(new Set(names)) } },
      select: { id: true, title: true, seriesName: true, seriesPosition: true, authors: true },
    })
    : []
  const bySeries = new Map<string, typeof works>()
  for (const w of works) {
    if (!w.seriesName || !w.authors[0]) continue
    const key = seriesKey(w.seriesName, w.authors[0])
    bySeries.set(key, [...(bySeries.get(key) ?? []), w])
  }
  return bySeries
}

// The series among `due` that someone follows or has a started book in.
async function wantedKeys(due: { seriesKey: string, name: string }[]) {
  const keys = due.map((s) => s.seriesKey)
  const followed = await prisma.seriesFollow.findMany({ where: { seriesKey: { in: keys } }, select: { seriesKey: true }, distinct: ["seriesKey"] })
  const wanted = new Set(followed.map((f) => f.seriesKey))
  const rest = due.filter((s) => !wanted.has(s.seriesKey))
  if (rest.length === 0) return wanted

  const keyOf = new Map(Array.from((await worksBySeries(rest.map((s) => s.name))).entries()).flatMap(([key, works]) => works.map((w) => [w.id, key] as const)))
  if (keyOf.size === 0) return wanted
  const read = await prisma.book.findMany({
    where: { workId: { in: Array.from(keyOf.keys()) }, ...startedWhere },
    select: { workId: true },
    distinct: ["workId"],
  })
  for (const b of read) {
    const key = b.workId && keyOf.get(b.workId)
    if (key) wanted.add(key)
  }
  return wanted
}

export interface UnrecordedSeries extends SeriesId {
  // The series' books in the catalogue, earliest first: the first is what Hardcover is asked about.
  works: { title: string, seriesPosition: number | null }[]
}

// Series someone follows, or has a started book in, with no SeriesCheck. `activeSince` narrows the started
// ones to books started, finished or read on since then (the cron); without it, all of history (the backfill).
export async function unrecordedSeries({ activeSince }: { activeSince?: Date } = {}): Promise<UnrecordedSeries[]> {
  const follows = await prisma.seriesFollow.findMany({ select: { seriesKey: true, name: true }, distinct: ["seriesKey"] })
  const read = await prisma.book.findMany({
    where: {
      workId: { not: null },
      ...startedWhere,
      ...(activeSince && { AND: [{ OR: [{ startedAt: { gte: activeSince } }, { completedAt: { gte: activeSince } }, { progressAt: { gte: activeSince } }] }] }),
    },
    select: { workId: true },
    distinct: ["workId"],
  })
  const readWorks = read.length
    ? await prisma.work.findMany({ where: { id: { in: read.map((b) => b.workId!) }, seriesName: { not: null } }, select: { id: true, seriesName: true } })
    : []
  const readIds = new Set(readWorks.map((w) => w.id))
  const bySeries = await worksBySeries([...follows.map((f) => f.name), ...readWorks.map((w) => w.seriesName!)])
  const wanted = new Set(follows.map((f) => f.seriesKey))
  for (const [key, works] of Array.from(bySeries.entries())) {
    if (works.some((w) => readIds.has(w.id))) wanted.add(key)
  }
  const keys = Array.from(wanted).filter((key) => bySeries.has(key))
  const recorded = new Set((await prisma.seriesCheck.findMany({ where: { seriesKey: { in: keys } }, select: { seriesKey: true } })).map((c) => c.seriesKey))
  return keys.filter((key) => !recorded.has(key)).map((key) => {
    const works = [...bySeries.get(key)!].sort((a, b) => (a.seriesPosition ?? Infinity) - (b.seriesPosition ?? Infinity))
    return { key, name: works[0].seriesName!, author: works[0].authors[0], works: works.map((w) => ({ title: w.title, seriesPosition: w.seriesPosition })) }
  })
}

// Records a series for the first time: Hardcover's id and the furthest book out, or, when Hardcover doesn't
// know it, the catalogue's furthest book (looked up again at its weekly check). Nobody is told. Four
// Hardcover requests; throws like lib/hardcover.ts. Returns whether Hardcover knew it.
export async function recordExistingSeries(series: UnrecordedSeries, now = new Date()): Promise<boolean> {
  const catalogue = series.works.map((w) => w.seriesPosition)
  const found = await hardcoverSeriesOf(series.works[0].title, series.author)
  const books = found ? await hardcoverSeriesBooks(found.id, series.author, now) : []
  await recordSeriesCheck(series, found?.id ?? null, [...catalogue, ...books.map((b) => b.position)], { checkedAt: now, announce: false })
  return !!found
}

export async function recheckSeries({ limit = 40, now = new Date(), pace = PACE_MS, deadline = Date.now() + 50_000 }: {
  limit?: number
  now?: Date
  pace?: number
  // When to stop starting Hardcover requests (ms since the epoch), so the run ends inside its function's time.
  deadline?: number
} = {}): Promise<RecheckResult> {
  const result: RecheckResult = { checked: 0, passedOver: 0, newBooks: 0, told: 0, recorded: 0, notOnHardcover: 0 }
  if (!hardcoverConfigured()) return { ...result, stoppedBy: "HARDCOVER_API_TOKEN is not set" }
  // Waits out the requests just made, then says whether there's time for `requests` more.
  let spent = 0
  const room = async (requests: number) => {
    if (spent) await sleep(spent * pace)
    spent = requests
    return Date.now() + requests * pace < deadline
  }

  // 1. The weekly re-check. More than the limit is taken, since some will be passed over.
  const due = await prisma.seriesCheck.findMany({
    where: { checkedAt: { lt: new Date(now.getTime() - RECHECK_AFTER_DAYS * DAY_MS) } },
    orderBy: { checkedAt: "asc" },
    take: limit * 4,
  })
  const wanted = due.length ? await wantedKeys(due) : new Set<string>()
  const passedOver = due.filter((s) => !wanted.has(s.seriesKey))
  if (passedOver.length) {
    await prisma.seriesCheck.updateMany({ where: { id: { in: passedOver.map((s) => s.id) } }, data: { checkedAt: now } })
    result.passedOver = passedOver.length
  }

  for (const series of due.filter((s) => wanted.has(s.seriesKey)).slice(0, limit)) {
    const id = { key: series.seriesKey, name: series.name, author: series.author }
    try {
      if (series.hardcoverSeriesId == null) {
        // Hardcover didn't know it last time: look it up again, taking what it has as the starting point.
        if (!(await room(LOOKUP_REQUESTS))) return result
        const works = (await worksBySeries([series.name])).get(series.seriesKey)
        if (!works?.length) continue
        if (!(await recordExistingSeries({ ...id, works: [...works].sort((a, b) => (a.seriesPosition ?? Infinity) - (b.seriesPosition ?? Infinity)) }, now))) result.notOnHardcover++
      } else {
        if (!(await room(1))) return result
        const books = await hardcoverSeriesBooks(series.hardcoverSeriesId, series.author, now)
        const known = series.highestPosition
        const fresh = known == null ? [] : books.filter((b) => b.position > known)
        if (fresh.length) await fileSeriesBooks(series.name, series.author, fresh, now)
        result.newBooks += fresh.length
        result.told += await recordSeriesCheck(id, series.hardcoverSeriesId, books.map((b) => b.position), { checkedAt: now })
      }
      result.checked++
    } catch (err) {
      // Most likely Hardcover's limit: stop, and the series left are first in line tomorrow.
      result.stoppedBy = err instanceof Error ? err.message : String(err)
      console.warn(`series recheck: stopped at "${series.name}":`, result.stoppedBy)
      return result
    }
  }

  // 2. Series someone has started following or reading that aren't recorded yet, with the time left.
  for (const series of await unrecordedSeries({ activeSince: new Date(now.getTime() - ACTIVE_DAYS * DAY_MS) })) {
    if (!(await room(LOOKUP_REQUESTS))) break
    try {
      if (!(await recordExistingSeries(series, now))) result.notOnHardcover++
      result.recorded++
    } catch (err) {
      result.stoppedBy = err instanceof Error ? err.message : String(err)
      console.warn(`series recheck: stopped recording "${series.name}":`, result.stoppedBy)
      break
    }
  }
  return result
}
