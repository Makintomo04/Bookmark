import prisma from "@/lib/db"
import { hardcoverConfigured, hardcoverSeriesBooks } from "@/lib/hardcover"
import { seriesKey } from "@/lib/series"
import { fileSeriesBooks } from "@/lib/seriesFill"
import { recordSeriesCheck } from "@/lib/seriesNews"

// The weekly re-check (app/api/cron/series, daily): asks Hardcover again about series someone follows or
// has started, a week or more since they were last asked, files any book released since, and tells their
// readers (lib/seriesNews.ts). A fill only ever asks about a work once, so without this a book that comes
// out later would only reach the catalogue if someone happened to shelve it.
//
// One Hardcover request a series. A run is capped and paced under Hardcover's 60 a minute, so it fits in a
// serverless function's time; run daily, it gets through `limit` × 7 series a week.

export const RECHECK_AFTER_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const PACE_MS = 1100
const STARTED = ["STARTED", "COMPLETED", "PAUSED"] as const

export interface RecheckResult {
  checked: number
  // Due, but nobody follows or has started them: put back a week without asking Hardcover.
  passedOver: number
  newBooks: number
  told: number
  // Set when Hardcover failed and the run stopped early.
  stoppedBy?: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// The series among `due` that someone follows or has a started book in.
async function wantedKeys(due: { seriesKey: string, name: string }[]) {
  const keys = due.map((s) => s.seriesKey)
  const followed = await prisma.seriesFollow.findMany({ where: { seriesKey: { in: keys } }, select: { seriesKey: true }, distinct: ["seriesKey"] })
  const wanted = new Set(followed.map((f) => f.seriesKey))
  const rest = due.filter((s) => !wanted.has(s.seriesKey))
  if (rest.length === 0) return wanted

  const works = await prisma.work.findMany({
    where: { seriesName: { in: Array.from(new Set(rest.map((s) => s.name))) } },
    select: { id: true, seriesName: true, authors: true },
  })
  const keyOf = new Map(works.flatMap((w) => (w.seriesName && w.authors[0] ? [[w.id, seriesKey(w.seriesName, w.authors[0])] as const] : [])))
  if (keyOf.size === 0) return wanted
  const read = await prisma.book.findMany({
    where: { workId: { in: Array.from(keyOf.keys()) }, OR: [{ status: { in: [...STARTED] } }, { timesRead: { gt: 0 } }] },
    select: { workId: true },
    distinct: ["workId"],
  })
  for (const b of read) {
    const key = b.workId && keyOf.get(b.workId)
    if (key) wanted.add(key)
  }
  return wanted
}

export async function recheckSeries({ limit = 40, now = new Date(), pace = PACE_MS }: { limit?: number, now?: Date, pace?: number } = {}): Promise<RecheckResult> {
  const result: RecheckResult = { checked: 0, passedOver: 0, newBooks: 0, told: 0 }
  if (!hardcoverConfigured()) return { ...result, stoppedBy: "HARDCOVER_API_TOKEN is not set" }

  // More than the limit, since some will be passed over.
  const due = await prisma.seriesCheck.findMany({
    where: { checkedAt: { lt: new Date(now.getTime() - RECHECK_AFTER_DAYS * DAY_MS) } },
    orderBy: { checkedAt: "asc" },
    take: limit * 4,
  })
  if (due.length === 0) return result
  const wanted = await wantedKeys(due)
  const passedOver = due.filter((s) => !wanted.has(s.seriesKey))
  if (passedOver.length) {
    await prisma.seriesCheck.updateMany({ where: { id: { in: passedOver.map((s) => s.id) } }, data: { checkedAt: now } })
    result.passedOver = passedOver.length
  }

  const toAsk = due.filter((s) => wanted.has(s.seriesKey)).slice(0, limit)
  for (let i = 0; i < toAsk.length; i++) {
    const series = toAsk[i]
    if (i > 0) await sleep(pace)
    try {
      const books = await hardcoverSeriesBooks(series.hardcoverSeriesId, series.author, now)
      const known = series.highestPosition
      const fresh = known == null ? [] : books.filter((b) => b.position > known)
      if (fresh.length) await fileSeriesBooks(series.name, series.author, fresh, now)
      result.newBooks += fresh.length
      result.told += await recordSeriesCheck({ key: series.seriesKey, name: series.name, author: series.author }, series.hardcoverSeriesId, books.map((b) => b.position), now)
      result.checked++
    } catch (err) {
      // Most likely Hardcover's limit: stop, and the series left are first in line tomorrow.
      result.stoppedBy = err instanceof Error ? err.message : String(err)
      console.warn(`series recheck: stopped at "${series.name}":`, result.stoppedBy)
      break
    }
  }
  return result
}
