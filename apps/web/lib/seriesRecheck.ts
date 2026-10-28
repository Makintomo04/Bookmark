import prisma from "@/lib/db"
import { hardcoverConfigured, hardcoverSeriesBooks, hardcoverSeriesOf } from "@/lib/hardcover"
import { seriesKey } from "@/lib/series"
import { fileSeriesBooks } from "@/lib/seriesFill"
import { highestPosition, recordSeriesCheck, sendSeriesNews, type SeriesId } from "@/lib/seriesNews"

// The hourly cron's work (app/api/cron/series), in three parts:
//
// 1. Queueing series nobody has recorded: once someone follows a series, or starts a book in it, it gets a
//    SeriesCheck, due at once, from the catalogue's books alone. Only the last day's follows and reading
//    are looked at, so this stays small however many readers there are; scripts/backfill-series-checks.ts
//    queues the rest of history.
// 2. The weekly re-check: asks Hardcover again about series someone follows or has started, a week or more
//    since they were last asked, files any book released since, and queues it for its readers
//    (lib/seriesNews.ts). A fill only ever asks about a work once, so without this a book that comes out
//    later would only reach the catalogue if someone happened to shelve it. A series Hardcover hasn't known
//    so far (a newly queued one, say) is looked up instead, and nobody is told: its books are the starting
//    point.
// 3. Telling readers about queued books, in batches, with the time left.
//
// A re-check costs one Hardcover request, a lookup four. A run spends at most RUN_REQUESTS, paced at half
// Hardcover's 60 a minute so readers' searches still get through, and stops at a deadline so it ends
// inside its function's time; what's left goes first the next hour.

export const RECHECK_AFTER_DAYS = 7
// Follows and reading this recent are where new series are found. Longer than the hour between runs, so a
// run that fails or is skipped loses nothing.
export const ACTIVE_HOURS = 24
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
// Per Hardcover request: 30 a minute, half its limit.
const PACE_MS = 2000
// Hardcover requests a run may spend: 24 runs a day is at most 1,440 of its 5,000 a day.
export const RUN_REQUESTS = 60
const LOOKUP_REQUESTS = 4
const STARTED = ["STARTED", "COMPLETED", "PAUSED"] as const
// A book that counts as reading the series: one being read, finished, on hold, or read before.
const startedWhere = { OR: [{ status: { in: [...STARTED] } }, { timesRead: { gt: 0 } }] }

export interface RecheckResult {
  // Series recorded for the first time, to be looked up on Hardcover.
  queued: number
  checked: number
  // Due, but nobody follows or has started them: put back a week without asking Hardcover.
  passedOver: number
  // Lookups Hardcover didn't know the series for.
  notOnHardcover: number
  newBooks: number
  // Readers told, and series whose readers aren't all told yet (they carry on next run).
  told: number
  announcing: number
  // Hardcover requests spent.
  requests: number
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

const byPosition = <T extends { seriesPosition: number | null }>(works: T[]) =>
  [...works].sort((a, b) => (a.seriesPosition ?? Infinity) - (b.seriesPosition ?? Infinity))

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

// Series someone follows, or has a started book in, with no SeriesCheck. `activeSince` narrows them to
// follows made, and books started, finished or read on, since then (the cron); without it, all of history
// (the backfill).
export async function unrecordedSeries({ activeSince }: { activeSince?: Date } = {}): Promise<UnrecordedSeries[]> {
  const follows = await prisma.seriesFollow.findMany({
    where: activeSince && { createdAt: { gte: activeSince } },
    select: { seriesKey: true, name: true },
    distinct: ["seriesKey"],
  })
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
    const works = byPosition(bySeries.get(key)!)
    return { key, name: works[0].seriesName!, author: works[0].authors[0], works: works.map((w) => ({ title: w.title, seriesPosition: w.seriesPosition })) }
  })
}

// Records series for the first time from the catalogue's books, due at once, so the re-check looks them up
// on Hardcover. No Hardcover requests. Returns how many were recorded.
export async function queueSeries(series: UnrecordedSeries[], now = new Date()): Promise<number> {
  let queued = 0
  for (const s of series) {
    try {
      await prisma.seriesCheck.create({
        data: {
          seriesKey: s.key,
          name: s.name,
          author: s.author,
          hardcoverSeriesId: null,
          highestPosition: highestPosition(s.works.map((w) => w.seriesPosition)),
          // Due now, behind anything already overdue.
          checkedAt: new Date(now.getTime() - RECHECK_AFTER_DAYS * DAY_MS),
        },
      })
      queued++
    } catch (err) {
      // Recorded meanwhile, by a fill.
      if ((err as { code?: string }).code !== "P2002") throw err
    }
  }
  return queued
}

// Looks up a series Hardcover hasn't known so far: its id and the furthest book out, or the catalogue's
// furthest book again when it still doesn't know it. Nobody is told. Four Hardcover requests; throws like
// lib/hardcover.ts. Returns whether Hardcover knew it.
export async function lookUpSeries(series: UnrecordedSeries, now = new Date()): Promise<boolean> {
  const catalogue = series.works.map((w) => w.seriesPosition)
  const found = await hardcoverSeriesOf(series.works[0].title, series.author)
  const books = found ? await hardcoverSeriesBooks(found.id, series.author, now) : []
  await recordSeriesCheck(series, found?.id ?? null, [...catalogue, ...books.map((b) => b.position)], { checkedAt: now, announce: false })
  return !!found
}

export async function recheckSeries({ now = new Date(), pace = PACE_MS, requests = RUN_REQUESTS, deadline = Date.now() + 150_000, sendBy = Date.now() + 260_000 }: {
  now?: Date
  pace?: number
  // Hardcover requests to spend at most.
  requests?: number
  // When to stop starting Hardcover requests, and when to stop telling readers (ms since the epoch), so
  // the run ends inside its function's time.
  deadline?: number
  sendBy?: number
} = {}): Promise<RecheckResult> {
  const result: RecheckResult = { queued: 0, checked: 0, passedOver: 0, notOnHardcover: 0, newBooks: 0, told: 0, announcing: 0, requests: 0 }

  // 1. New series, from the last day's follows and reading.
  result.queued = await queueSeries(await unrecordedSeries({ activeSince: new Date(now.getTime() - ACTIVE_HOURS * HOUR_MS) }), now)

  // 2. The weekly re-check.
  if (!hardcoverConfigured()) result.stoppedBy = "HARDCOVER_API_TOKEN is not set"
  else await recheckDue(result, { now, pace, requests, deadline })

  // 3. Telling readers.
  Object.assign(result, await sendSeriesNews({ deadline: sendBy }))
  return result
}

async function recheckDue(result: RecheckResult, { now, pace, requests, deadline }: { now: Date, pace: number, requests: number, deadline: number }) {
  // Waits out the requests just made, then says whether the budget and the time allow `n` more.
  let last = 0
  const room = async (n: number) => {
    if (result.requests + n > requests) return false
    if (last) await sleep(last * pace)
    last = n
    if (Date.now() + n * pace >= deadline) return false
    result.requests += n
    return true
  }

  // Each re-check is at least one request, and some are passed over, so more than the budget are taken.
  const due = await prisma.seriesCheck.findMany({
    where: { checkedAt: { lt: new Date(now.getTime() - RECHECK_AFTER_DAYS * DAY_MS) } },
    orderBy: { checkedAt: "asc" },
    take: requests * 4,
  })
  const wanted = due.length ? await wantedKeys(due) : new Set<string>()
  const passedOver = due.filter((s) => !wanted.has(s.seriesKey))
  if (passedOver.length) {
    await prisma.seriesCheck.updateMany({ where: { id: { in: passedOver.map((s) => s.id) } }, data: { checkedAt: now } })
    result.passedOver = passedOver.length
  }

  for (const series of due.filter((s) => wanted.has(s.seriesKey))) {
    const id = { key: series.seriesKey, name: series.name, author: series.author }
    try {
      if (series.hardcoverSeriesId == null) {
        // Hardcover hasn't known it so far: look it up, taking what it has as the starting point.
        const works = (await worksBySeries([series.name])).get(series.seriesKey)
        if (!works?.length) {
          // Its books have left the series (a librarian's fix, say): asked about again in a week.
          await prisma.seriesCheck.update({ where: { id: series.id }, data: { checkedAt: now } })
          continue
        }
        if (!(await room(LOOKUP_REQUESTS))) return
        if (!(await lookUpSeries({ ...id, works: byPosition(works) }, now))) result.notOnHardcover++
      } else {
        if (!(await room(1))) return
        const books = await hardcoverSeriesBooks(series.hardcoverSeriesId, series.author, now)
        const known = series.highestPosition
        const fresh = known == null ? [] : books.filter((b) => b.position > known)
        if (fresh.length) await fileSeriesBooks(series.name, series.author, fresh, now)
        result.newBooks += fresh.length
        await recordSeriesCheck(id, series.hardcoverSeriesId, books.map((b) => b.position), { checkedAt: now })
      }
      result.checked++
    } catch (err) {
      // Most likely Hardcover's limit: stop, and the series left are first in line next run.
      result.stoppedBy = err instanceof Error ? err.message : String(err)
      console.warn(`series recheck: stopped at "${series.name}":`, result.stoppedBy)
      return
    }
  }
}
