import type { Prisma } from "@prisma/client"
import prisma from "@/lib/db"
import { resolveCatalogMany } from "@/lib/catalog"
import { createNotifications } from "@/lib/notifications"
import { hardcoverAuthorId, hardcoverAuthorReleases, hardcoverConfigured, type HardcoverRelease } from "@/lib/hardcover"
import { authorSlug } from "@/lib/authorNames"
import { seriesKey } from "@/lib/series"
import { addDays } from "@bookmark/shared/reminders"
import { BOOK_NEWS_TYPES } from "@/lib/releaseRules"

// Telling readers when an author they follow, or a series they follow, has a new book (BOO-8). Each such
// author is remembered as an AuthorCheck, with the Hardcover ids of their books out lately or coming; once a
// week the hourly cron (app/api/cron/authors) asks Hardcover again, and a book it hasn't seen before is new.
// New books are filed in the catalogue (Hardcover works, with book pages and their release date) and their
// readers told in batches, like a new book in a series (lib/seriesNews.ts).
//
// The first time an author is looked up nobody is told: what's announced already is the starting point
// (its books still to come are filed, so they're in Upcoming and get their publication day).
// A series' followers hear through its author, since Hardcover lists a book's series with it: following a
// series queues its first author too. A series book that has come out is still announced by the series
// re-check as before (NEW_IN_SERIES), so a series follower hears when it's announced and when it's out.
//
// A check costs one Hardcover request, a first lookup up to three. A run spends at most RUN_REQUESTS, paced
// at half Hardcover's 60 a minute, at half past the hour so it never runs alongside the series cron.

export const RECHECK_AFTER_DAYS = 7
// A book Hardcover adds that came out longer ago than this is back catalogue, not news.
export const NEWS_DAYS = 14
// How far back the check reads. Longer than NEWS_DAYS, so a book just out stays in what's been seen and
// isn't taken for new when it's next read.
export const LOOKBACK_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000
const PACE_MS = 2000
// Hardcover requests a run may spend: 24 runs a day is at most 960, beside the series cron's 1,440, of the
// Supporter plan's 50,000 a day.
export const RUN_REQUESTS = 40
const LOOKUP_REQUESTS = 3
// Readers told per batch, as for a series.
export const ANNOUNCE_BATCH = 500

export interface AuthorNewsResult {
  queued: number
  checked: number
  // Due, but nobody follows them or a series of theirs any more: put back a week without asking Hardcover.
  passedOver: number
  notOnHardcover: number
  newBooks: number
  // Release dates Hardcover moved, put right on the catalogue's works.
  datesMoved: number
  // Books still to come filed on an author's first lookup, with nobody told.
  filedComing: number
  told: number
  announcing: number
  requests: number
  stoppedBy?: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const dayOf = (date: Date) => date.toISOString().slice(0, 10)

// ---- Which books are new, and who hears. No database. ----------------------------------------------

// Hardcover lists books barely announced: "Untitled Stormlight Archive #6", on a placeholder date years
// off. Those are left out until they have a title and are within ANNOUNCED_YEARS, and so count as new then,
// which is when they're news.
export const ANNOUNCED_YEARS = 2
export const isAnnounced = (r: { title: string, releaseDate: string }, today: string) =>
  !/^untitled\b/i.test(r.title.trim()) && r.releaseDate <= addDays(today, ANNOUNCED_YEARS * 365)

// The books in a check's answer that are news: not seen before, and coming or out in the last NEWS_DAYS.
export function freshReleases<T extends { hardcoverId: string, releaseDate: string }>(releases: T[], seenIds: number[], today: string): T[] {
  const seen = new Set(seenIds)
  const since = addDays(today, -NEWS_DAYS)
  return releases.filter((r) => !seen.has(Number(r.hardcoverId)) && r.releaseDate >= since)
}

// What the check remembers as seen: everything it was just told about.
export const seenIdsOf = (releases: { hardcoverId: string }[]) =>
  Array.from(new Set(releases.flatMap((r) => (Number.isInteger(Number(r.hardcoverId)) ? [Number(r.hardcoverId)] : []))))

export interface AuthorNewBookRow {
  workId: string
  // seriesKey of the series Hardcover puts it in, when there is one.
  seriesKey: string | null
  releaseDate: string | null
}

// One notification per reader for one check's new books (a batch): the books they'd want, earliest out
// first, counted, with the first named. An author's followers hear of all of them, a series' followers of
// that series' books. A book already on their shelf (any status, an advance copy included) isn't news. A
// reader already told about any of these books (`alreadyTold`, "<userId>|<workId>": announced, new in its
// series, or out) isn't told again: a notification names only the first book it counts, so being told about
// one is taken as being told about the batch. Later checks' books are their own batch.
export function authorNewsNotifications({ authorFollowers, seriesFollowers, books, shelved = new Set(), alreadyTold = new Set() }: {
  authorFollowers: string[]
  // Readers following each series, by seriesKey.
  seriesFollowers: Map<string, string[]>
  books: AuthorNewBookRow[]
  // "<userId>|<workId>"
  shelved?: Set<string>
  alreadyTold?: Set<string>
}): Prisma.NotificationUncheckedCreateInput[] {
  const inOrder = [...books].sort((a, b) => (a.releaseDate ?? "9999").localeCompare(b.releaseDate ?? "9999"))
  const wanted = new Map<string, Set<string>>()
  const want = (userId: string, workId: string) => wanted.set(userId, (wanted.get(userId) ?? new Set()).add(workId))
  for (const userId of authorFollowers) for (const b of books) want(userId, b.workId)
  for (const b of books) for (const userId of (b.seriesKey && seriesFollowers.get(b.seriesKey)) || []) want(userId, b.workId)
  return Array.from(wanted.entries()).flatMap(([userId, ids]) => {
    if (books.some((b) => alreadyTold.has(`${userId}|${b.workId}`))) return []
    const fresh = inOrder.filter((b) => ids.has(b.workId) && !shelved.has(`${userId}|${b.workId}`))
    if (fresh.length === 0) return []
    return [{ userId, actorId: userId, type: "NEW_BOOK" as const, workId: fresh[0].workId, count: fresh.length }]
  })
}

// ---- Who to check ------------------------------------------------------------------------------------

interface FollowedAuthor {
  slug: string
  name: string
}

// Every author someone follows, or follows a series of, by slug. Distinct queries, so this stays a list of
// authors however many readers follow each.
async function followedAuthors(): Promise<FollowedAuthor[]> {
  const [authors, series] = await Promise.all([
    prisma.authorFollow.findMany({ select: { slug: true, name: true }, distinct: ["slug"] }),
    prisma.seriesFollow.findMany({ select: { author: true }, distinct: ["author"] }),
  ])
  const bySlug = new Map<string, FollowedAuthor>(authors.map((a) => [a.slug, a]))
  for (const s of series) {
    const slug = authorSlug(s.author)
    if (slug && !bySlug.has(slug)) bySlug.set(slug, { slug, name: s.author })
  }
  return Array.from(bySlug.values())
}

// Records followed authors with no AuthorCheck, due at once. No Hardcover requests.
export async function queueAuthors(now = new Date()): Promise<{ queued: number, followed: Set<string> }> {
  const followed = await followedAuthors()
  const recorded = new Set((await prisma.authorCheck.findMany({ where: { slug: { in: followed.map((a) => a.slug) } }, select: { slug: true } })).map((c) => c.slug))
  let queued = 0
  for (const a of followed.filter((f) => !recorded.has(f.slug))) {
    try {
      // Just past a week old, so this run's check takes it.
      await prisma.authorCheck.create({ data: { slug: a.slug, name: a.name, seenBookIds: [], checkedAt: new Date(now.getTime() - RECHECK_AFTER_DAYS * DAY_MS - 60_000) } })
      queued++
    } catch (err) {
      // Recorded meanwhile, by an overlapping run.
      if ((err as { code?: string }).code !== "P2002") throw err
    }
  }
  return { queued, followed: new Set(followed.map((a) => a.slug)) }
}

// ---- Filing new books -------------------------------------------------------------------------------

// Files the new books in the catalogue, so they have a book page and a release date, and returns them as
// the check's announcements, tagged with `batch`. Each is filed in its series without a place: the series'
// followers then get its publication day and see it first in Upcoming, while the tracker's "next" (books
// with a place) stays a book you can read. The series re-check gives it its place once it's out.
async function fileReleases(releases: HardcoverRelease[], author: string, batch: string) {
  if (releases.length === 0) return []
  const filed = await resolveCatalogMany(releases.map((r) => ({
    hardcoverId: r.hardcoverId,
    title: r.title,
    author,
    coverUrl: r.coverUrl,
    description: r.description ?? null,
    year: r.year ?? null,
    releaseDate: r.releaseDate,
    pages: r.pages,
    series: r.seriesName ? { name: r.seriesName, position: null } : null,
  })))
  return filed.map((f, i) => ({ workId: f.work.id, seriesName: releases[i].seriesName, batch }))
}

// Hardcover moves a date when a publisher does: works filed from it take the new date, unless a librarian
// set one. Only books not out yet: once a book is out, its date is history.
async function moveReleaseDates(releases: HardcoverRelease[], today: string): Promise<number> {
  const coming = releases.filter((r) => r.releaseDate > today)
  if (coming.length === 0) return 0
  const dateOf = new Map(coming.map((r) => [r.hardcoverId, r.releaseDate]))
  const works = await prisma.work.findMany({
    where: { hardcoverId: { in: Array.from(dateOf.keys()) } },
    select: { id: true, hardcoverId: true, releaseDate: true, curatedFields: true },
  })
  let moved = 0
  for (const w of works) {
    const date = dateOf.get(w.hardcoverId!)
    if (!date || w.releaseDate === date || w.curatedFields.includes("releaseDate") || (w.releaseDate && w.releaseDate <= today)) continue
    await prisma.work.update({ where: { id: w.id }, data: { releaseDate: date } })
    moved++
  }
  return moved
}

// ---- Telling readers --------------------------------------------------------------------------------

// Tells an author's followers, and the followers of each book's series, about the check's new books, up
// to `limit` readers. Readers already told are skipped, so calling it again carries on where it stopped.
export async function announceAuthorBooks(check: { slug: string, name: string, announcing: { workId: string, seriesName: string | null }[] }, limit = ANNOUNCE_BATCH): Promise<{ told: number, done: boolean }> {
  const books = check.announcing.map((b) => ({ workId: b.workId, seriesKey: b.seriesName ? seriesKey(b.seriesName, check.name) : null }))
  if (books.length === 0) return { told: 0, done: true }
  const workIds = books.map((b) => b.workId)
  const seriesKeys = Array.from(new Set(books.flatMap((b) => (b.seriesKey ? [b.seriesKey] : []))))
  const [works, authorFollows, seriesFollows, shelf, told] = await Promise.all([
    prisma.work.findMany({ where: { id: { in: workIds } }, select: { id: true, releaseDate: true } }),
    prisma.authorFollow.findMany({ where: { slug: check.slug }, select: { userId: true } }),
    seriesKeys.length ? prisma.seriesFollow.findMany({ where: { seriesKey: { in: seriesKeys } }, select: { userId: true, seriesKey: true } }) : [],
    prisma.book.findMany({ where: { workId: { in: workIds } }, select: { userId: true, workId: true } }),
    prisma.notification.findMany({ where: { type: { in: [...BOOK_NEWS_TYPES] }, workId: { in: workIds } }, select: { userId: true, workId: true } }),
  ])
  const dateOf = new Map(works.map((w) => [w.id, w.releaseDate]))
  const seriesFollowers = new Map<string, string[]>()
  for (const f of seriesFollows) seriesFollowers.set(f.seriesKey, [...(seriesFollowers.get(f.seriesKey) ?? []), f.userId])
  const rows = authorNewsNotifications({
    authorFollowers: authorFollows.map((f) => f.userId),
    seriesFollowers,
    // A work merged away since isn't news any more.
    books: books.filter((b) => dateOf.has(b.workId)).map((b) => ({ ...b, releaseDate: dateOf.get(b.workId) ?? null })),
    shelved: new Set(shelf.map((b) => `${b.userId}|${b.workId}`)),
    alreadyTold: new Set(told.map((n) => `${n.userId}|${n.workId}`)),
  })
  await createNotifications(rows.slice(0, limit))
  return { told: Math.min(rows.length, limit), done: rows.length <= limit }
}

// A check's queued books split into the batches they were found in, oldest first. Books queued before
// batches existed are one batch. No database.
export function announcementBatches<T extends { batch?: string | null }>(announcing: T[]): T[][] {
  const batches = new Map<string, T[]>()
  for (const b of announcing) batches.set(b.batch ?? "", [...(batches.get(b.batch ?? "") ?? []), b])
  return Array.from(batches.values())
}

// Tells readers about every check's queued books, a batch at a time, until `deadline` (ms since the epoch).
// A batch whose readers have all been told leaves the queue; the rest carry on next run.
export async function sendAuthorNews({ deadline }: { deadline: number }): Promise<{ told: number, announcing: number }> {
  const queued = await prisma.authorCheck.findMany({
    where: { announcing: { isEmpty: false } },
    select: { id: true, slug: true, name: true, announcing: true },
  })
  let told = 0
  let announcing = 0
  for (const check of queued) {
    const left: typeof check.announcing = []
    for (const books of announcementBatches(check.announcing)) {
      let done = false
      try {
        while (!done && Date.now() < deadline) {
          const batch = await announceAuthorBooks({ ...check, announcing: books.map((b) => ({ workId: b.workId, seriesName: b.seriesName ?? null })) })
          told += batch.told
          done = batch.done
        }
      } catch (err) {
        // Left queued; readers not yet told are told next run.
        console.warn(`author news: couldn't tell readers of ${check.name}:`, err instanceof Error ? err.message : err)
      }
      if (!done) left.push(...books)
    }
    // Only this run adds announcements, and it already has, so rewriting the queue can't lose a newer one.
    if (left.length < check.announcing.length) await prisma.authorCheck.update({ where: { id: check.id }, data: { announcing: left } })
    if (left.length) announcing++
  }
  return { told, announcing }
}

// ---- The run ----------------------------------------------------------------------------------------

export async function recheckAuthors({ now = new Date(), pace = PACE_MS, requests = RUN_REQUESTS, deadline = Date.now() + 150_000, sendBy = Date.now() + 260_000 }: {
  now?: Date
  pace?: number
  requests?: number
  // When to stop starting Hardcover requests, and when to stop telling readers (ms since the epoch).
  deadline?: number
  sendBy?: number
} = {}): Promise<AuthorNewsResult> {
  const result: AuthorNewsResult = { queued: 0, checked: 0, passedOver: 0, notOnHardcover: 0, newBooks: 0, datesMoved: 0, filedComing: 0, told: 0, announcing: 0, requests: 0 }

  const { queued, followed } = await queueAuthors(now)
  result.queued = queued

  if (!hardcoverConfigured()) result.stoppedBy = "HARDCOVER_API_TOKEN is not set"
  else await checkDue(result, followed, { now, pace, requests, deadline })

  Object.assign(result, await sendAuthorNews({ deadline: sendBy }))
  return result
}

async function checkDue(result: AuthorNewsResult, followed: Set<string>, { now, pace, requests, deadline }: { now: Date, pace: number, requests: number, deadline: number }) {
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

  const due = await prisma.authorCheck.findMany({
    where: { checkedAt: { lt: new Date(now.getTime() - RECHECK_AFTER_DAYS * DAY_MS) } },
    orderBy: { checkedAt: "asc" },
    take: requests * 2,
  })
  const passedOver = due.filter((c) => !followed.has(c.slug))
  if (passedOver.length) {
    await prisma.authorCheck.updateMany({ where: { id: { in: passedOver.map((c) => c.id) } }, data: { checkedAt: now } })
    result.passedOver = passedOver.length
  }

  const today = dayOf(now)
  const from = addDays(today, -LOOKBACK_DAYS)
  for (const check of due.filter((c) => followed.has(c.slug))) {
    try {
      if (check.hardcoverAuthorId == null) {
        // Not looked up so far: what Hardcover has now is the starting point, and nobody is told. Books still
        // to come are filed all the same, for Upcoming and their publication day.
        if (!(await room(LOOKUP_REQUESTS))) return
        const id = await hardcoverAuthorId(check.slug, check.name)
        const releases = id == null ? [] : (await hardcoverAuthorReleases(id, check.name, from)).filter((r) => isAnnounced(r, today))
        if (id == null) result.notOnHardcover++
        else {
          result.datesMoved += await moveReleaseDates(releases, today)
          result.filedComing += (await fileReleases(releases.filter((r) => r.releaseDate > today), check.name, now.toISOString())).length
        }
        await prisma.authorCheck.update({ where: { id: check.id }, data: { hardcoverAuthorId: id, seenBookIds: seenIdsOf(releases), checkedAt: now } })
      } else {
        if (!(await room(1))) return
        const releases = (await hardcoverAuthorReleases(check.hardcoverAuthorId, check.name, from)).filter((r) => isAnnounced(r, today))
        const fresh = freshReleases(releases, check.seenBookIds, today)
        const filed = await fileReleases(fresh, check.name, now.toISOString())
        result.newBooks += filed.length
        result.datesMoved += await moveReleaseDates(releases, today)
        await prisma.authorCheck.update({
          where: { id: check.id },
          data: {
            // Kept with what was seen before, so a book Hardcover drops for a week isn't new when it's back.
            seenBookIds: Array.from(new Set([...seenIdsOf(releases), ...check.seenBookIds])).slice(0, 200),
            ...(filed.length && { announcing: [...check.announcing, ...filed] }),
            checkedAt: now,
          },
        })
      }
      result.checked++
    } catch (err) {
      // Most likely Hardcover's limit: stop, and the authors left are first in line next run.
      result.stoppedBy = err instanceof Error ? err.message : String(err)
      console.warn(`author news: stopped at ${check.name}:`, result.stoppedBy)
      return
    }
  }
}
