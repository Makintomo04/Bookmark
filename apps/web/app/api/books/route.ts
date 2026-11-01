import { bookFieldsProblem } from "@/lib/bookInput";
import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { requestTimeZone, resolveTimeZone, syncAchievements } from "@/lib/achievements";
import { earnMomentFor } from "@/lib/earnMomentServer";
import { catalogIds, linkCatalog, type Resolved } from "@/lib/catalog";
import { shareableCover, uploadersOf } from "@/lib/uploads";
import { librarianCover } from "@/lib/catalogueFixRules";
import { normaliseWorkKey } from "@/lib/workKey";
import { DESCRIPTION_MAX, workDescription } from "@/lib/openLibrary";
import { RATING_ERROR, optionalDaySchema, ratingSchema, readFromBook } from "@/lib/readHistory";
import { EditionFormat, Status } from "@prisma/client";
import { SHELF_STATUS, filterOptions, pageShelf, parseShelfParams, sortBooks, type ShelfKey } from "@/lib/shelfFilter";
import { rereadingIds, shelfBooks, withFormat } from "@/lib/shelfBooks";
import { z } from "zod";
import { parseAudioMinutes } from "@/lib/bookInput";
import { fillWorkSeriesQuietly } from "@/lib/seriesFill";
import { alreadyShelved, shelfCopies } from "@/lib/shelfCopy";

const statusSchema = z.nativeEnum(Status)
const optionalText = z.string().max(40).nullish()
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

// The add-book modal sends the blurb it already showed; one-click adds from Discover don't, so take
// the catalog's (fetched when the work is new to it), or look it up. Never let a slow or failed
// lookup block saving the book.
async function resolveDescription(description: unknown, workKey: unknown, catalog: Resolved | null) {
  if (typeof description === "string" && description.trim()) return description.trim().slice(0, DESCRIPTION_MAX)
  if (catalog?.work.description) return catalog.work.description
  const key = normaliseWorkKey(typeof workKey === "string" ? workKey : null)
  return key ? workDescription(key).catch(() => null) : null
}
import { NextResponse } from "next/server";

// Filing a book new to the catalog asks Open Library about it (a request or two, each capped at 8s).
export const maxDuration = 30;

// Covers are copied to UploadThing afterwards, by /api/books/[bookId]/cover.

// What search, sort and filter look at (ShelfBook in lib/shelfFilter.ts): enough to page a shelf of thousands
// without loading the books themselves.
const shelfBookSelect = {
  id: true, title: true, author: true, status: true, rating: true, pages: true, genre: true, tags: true,
  createdAt: true, startedAt: true, completedAt: true, stoppedAt: true, progressUnit: true, audioMinutes: true,
  edition: { select: { format: true } },
} as const

//   GET /api/books
// The reader's whole shelf, as an array. The web's useBooks reads it for search, sort and filter in the
// browser (lib/shelfFilter.ts), and phone builds from before paging read it too, so it stays as it is.
//
//   GET /api/books?shelves=20
// The newest of each shelf (in each shelf's own order) and how many each holds, with which books being read are
// re-reads: the phone's Library tab, which shows a row of each with See all. { shelves, counts, rereading }.
//
//   GET /api/books?select=finished
// Every book on one shelf, as select mode needs them (Select all on a shelf the Library shows only the start
// of): { books: [{ id, status, isPrivate }] }.
//
//   GET /api/books?take=60&cursor=60&shelf=finished&sort=title&q=le+guin&year=2024&genre=…&facets=1
// One page of it, searched, filtered and sorted on the server by the same rules (the phone's shelf screens):
// { books, total, nextCursor, options?, counts? }. `cursor` is the nextCursor of the page before, `shelf` and
// the filters are lib/shelfFilter.ts's URL params, and `facets=1` adds the filter menus' options (from the
// shelf asked for, unfiltered) and how many books each shelf holds.
export async function GET(req:Request) {

const { user: currentUser, response } = await requireUser();
if (response) return response;

const params = new URL(req.url).searchParams
if (params.has("take")) return shelfPage(currentUser.id, params)
if (params.has("shelves")) return shelfPreviews(currentUser.id, Number(params.get("shelves")))
if (params.has("select")) return shelfSelection(currentUser.id, params.get("select"))

// The blurb stays behind: it can run to a few KB a book, and the book's panel loads it from
// /api/books/[bookId] when opened.
const rows = await prisma.book.findMany({
  where:{
    userId: currentUser.id
  },
  include: withFormat,
})
return NextResponse.json(await shelfBooks(rows))
}

async function shelfPage(userId: string, params: URLSearchParams) {
  const filter = parseShelfParams(params)
  // In id order, so the same shelf always reaches pageShelf the same way (its sort breaks ties on id as well).
  const light = (await prisma.book.findMany({ where: { userId }, select: shelfBookSelect, orderBy: { id: "asc" } }))
    .map(({ edition, ...b }) => ({ ...b, format: edition?.format ?? null }))
  // "Finished in" counts on the reader's calendar, not the server's.
  const zone = await resolveTimeZone(userId, await requestTimeZone())
  const page = pageShelf(light, filter, { take: Number(params.get("take")), cursor: params.get("cursor"), zone })
  const ids = page.books.map((b) => b.id)
  const rows = ids.length > 0
    ? await prisma.book.findMany({ where: { userId, id: { in: ids } }, include: { edition: { select: { format: true } } } })
    : []
  const byId = new Map((await shelfBooks(rows)).map((b) => [b.id, b]))
  const facets = params.get("facets") === "1"
  const onShelf = filter.shelf ? light.filter((b) => b.status === SHELF_STATUS[filter.shelf!]) : light
  return NextResponse.json({
    books: ids.flatMap((id) => byId.get(id) ?? []),
    total: page.total,
    nextCursor: page.nextCursor,
    ...(facets && {
      options: filterOptions(onShelf, zone),
      counts: Object.fromEntries((Object.keys(SHELF_STATUS) as ShelfKey[]).map((k) => [k, light.filter((b) => b.status === SHELF_STATUS[k]).length])),
    }),
  })
}


// The most of each shelf ?shelves= sends.
const PREVIEW_MAX = 60

async function shelfPreviews(userId: string, size: number) {
  const take = Math.min(Math.max(Math.floor(size) || 20, 1), PREVIEW_MAX)
  const light = (await prisma.book.findMany({ where: { userId }, select: shelfBookSelect, orderBy: { id: "asc" } }))
    .map(({ edition, ...b }) => ({ ...b, format: edition?.format ?? null }))
  const keys = Object.keys(SHELF_STATUS) as ShelfKey[]
  const firstIds = Object.fromEntries(keys.map((k) => [k, sortBooks(light.filter((b) => b.status === SHELF_STATUS[k]), "recent").slice(0, take).map((b) => b.id)]))
  const ids = Object.values(firstIds).flat()
  const rows = ids.length > 0 ? await prisma.book.findMany({ where: { userId, id: { in: ids } }, include: withFormat }) : []
  const byId = new Map((await shelfBooks(rows)).map((b) => [b.id, b]))
  const reading = rows.filter((b) => b.status === "STARTED")
  return NextResponse.json({
    shelves: Object.fromEntries(keys.map((k) => [k, firstIds[k].flatMap((id) => byId.get(id) ?? [])])),
    counts: Object.fromEntries(keys.map((k) => [k, light.filter((b) => b.status === SHELF_STATUS[k]).length])),
    rereading: Array.from(await rereadingIds(userId, reading)),
  })
}

async function shelfSelection(userId: string, shelf: string | null) {
  const status = shelf && shelf in SHELF_STATUS ? SHELF_STATUS[shelf as ShelfKey] : null
  if (!status) return NextResponse.json({ error: "Unknown shelf" }, { status: 400 })
  const books = await prisma.book.findMany({ where: { userId, status }, select: { id: true, status: true, isPrivate: true } })
  return NextResponse.json({ books })
}

export async function POST(req:Request) {

const { user: currentUser, response } = await requireUser();
if (response) return response;
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { title, author, coverImgSrc, pages, status, currentPage, currentMinute, finishedThisYear, finishedOn, startedOn, rating, genre, workKey, description, editionKey, isbn13, isbn10, hardcoverId, format, audioMinutes, isPrivate } = body

if (typeof title !== "string" || !title.trim() || typeof author !== "string" || !author.trim()) {
  return NextResponse.json({ error: "Title and author are required" }, { status: 400 })
}
const fieldError = bookFieldsProblem({ title, author, genre, coverImgSrc })
if (fieldError) return NextResponse.json({ error: fieldError }, { status: 400 })
const parsedFormat = z.nativeEnum(EditionFormat).safeParse(format)
// An audiobook runs on minutes listened; its page count is optional (Open Library often knows the
// print length, which keeps "pages read" stats honest, but nobody has to type it).
const isAudiobook = parsedFormat.success && parsedFormat.data === "AUDIOBOOK"
const runningTime = isAudiobook ? parseAudioMinutes(audioMinutes) : null
if (isAudiobook && !runningTime) {
  return NextResponse.json({ error: "Enter the audiobook's running time" }, { status: 400 })
}
// Left blank, the page count is unknown (0): nobody should have to look it up to shelve a book. The
// catalog fills it in below when it knows the edition, and progress asks for it if it's still missing.
const givenPages = pages === undefined || pages === null || pages === "" ? 0 : parseInt(pages)
if (isNaN(givenPages) || givenPages < 0) {
  return NextResponse.json({ error: "Pages must be greater than 0" }, { status: 400 })
}
const parsedStatus = statusSchema.safeParse(status)
if (!parsedStatus.success) {
  return NextResponse.json({ error: "Invalid status" }, { status: 400 })
}
const parsedRating = ratingSchema.optional().safeParse(rating)
if (!parsedRating.success) {
  return NextResponse.json({ error: RATING_ERROR }, { status: 400 })
}

const now = new Date()
const shelf = parsedStatus.data
const isCompleted = shelf === "COMPLETED"
// A finished book's dates, as picked ("2024-03-01", or null for "I don't remember"). Older clients send
// finishedThisYear instead, which means today.
const finishedDay = optionalDaySchema.optional().safeParse(finishedOn)
const startedDay = optionalDaySchema.optional().safeParse(startedOn)
if (!finishedDay.success || !startedDay.success) {
  return NextResponse.json({ error: (finishedDay.success ? startedDay : finishedDay).error?.issues[0]?.message ?? "Invalid date" }, { status: 400 })
}
const finishedAt = finishedDay.data !== undefined ? finishedDay.data : finishedThisYear ? now : null
const startedAt = isCompleted ? startedDay.data ?? null : null
if (startedAt && finishedAt && startedAt > finishedAt) {
  return NextResponse.json({ error: "The start date is after the finish date" }, { status: 400 })
}
// A finish dated this year posts to followers and can earn a medal moment; a past read is logged quietly.
const finishedThisYearNow = isCompleted && !!finishedAt && finishedAt.getUTCFullYear() === now.getUTCFullYear()
const isStopped = shelf === "DNF" || shelf === "PAUSED"

// Already on the shelf (a second click on Want to read, or the same book searched for again): say where,
// before asking Open Library anything.
const [shelved] = await shelfCopies(currentUser.id, { title, author, workKey: typeof workKey === "string" ? workKey : null })
if (shelved) return NextResponse.json(alreadyShelved(shelved), { status: 409 })

const startMinute = runningTime ? Math.max(0, Math.min(runningTime, parseInt(currentMinute) || 0)) : 0
// The shared catalog: the Work and Edition this copy is of. A search hit carries its work key and
// usually an edition key or ISBN; a book typed in by hand is filed by title and author.
const catalog = await linkCatalog(
  {
    workKey: optionalText.safeParse(workKey).success ? str(workKey) : null,
    editionKey: optionalText.safeParse(editionKey).success ? str(editionKey) : null,
    isbn13: optionalText.safeParse(isbn13).success ? str(isbn13) : null,
    isbn10: optionalText.safeParse(isbn10).success ? str(isbn10) : null,
    // Hardcover's ids are numbers; anything else isn't one of its hits.
    hardcoverId: typeof hardcoverId === "string" && /^\d{1,12}$/.test(hardcoverId) ? hardcoverId : null,
    title: title.trim(),
    author: author.trim(),
    pages: givenPages > 0 ? givenPages : null,
    audioMinutes: runningTime,
    coverUrl: str(coverImgSrc),
    description: str(description)?.slice(0, DESCRIPTION_MAX) ?? null,
    format: parsedFormat.success ? parsedFormat.data : null,
  },
  { lookup: true, describe: true },
)
const totalPages = givenPages || (!isAudiobook && catalog?.edition.pages) || 0
// Adding from someone else's list or pick can bring their uploaded cover along. Uploads stay on the
// uploader's own copy (lib/uploads.ts), so this copy takes the catalogue's cover instead.
const ownCover = await shareableCover(str(coverImgSrc), currentUser.id)
// A cover a librarian set beats the one the search hit carried (Open Library's or Hardcover's). Only the
// reader's own upload beats that: what's left of ownCover after shareableCover is either theirs or no upload.
const ownUpload = ownCover && (await uploadersOf([ownCover])).size ? ownCover : null
const pinnedCover = catalog ? librarianCover(catalog.work, [catalog.edition]) : null
const coverImage = ownUpload ?? pinnedCover ?? ownCover ?? (coverImgSrc ? catalog?.edition.coverUrl ?? catalog?.work.coverUrl ?? "" : "")
const startPage = Math.max(0, Math.min(totalPages, parseInt(currentPage) || 0))
const book = await prisma.book.create({
  data:{
    userId: currentUser.id,
    title: title.trim(),
    author: author.trim(),
    coverImage,
    pages: totalPages,
    status: shelf,
    genre: genre || null,
    workKey: normaliseWorkKey(workKey) ?? catalog?.work.openLibraryKey ?? null,
    ...catalogIds(catalog),
    description: await resolveDescription(description, workKey, catalog),
    // The start date only feeds a "Started 3 Mar" label, so default it to today rather than asking.
    startedAt: shelf === "STARTED" ? now : startedAt,
    currentPage: isCompleted ? totalPages : shelf === "STARTED" || isStopped ? startPage : 0,
    progressUnit: runningTime ? "MINUTES" : null,
    audioMinutes: runningTime,
    currentMinute: runningTime ? (isCompleted ? runningTime : shelf === "STARTED" || isStopped ? startMinute : 0) : null,
    // The day the reader says they finished. Undated past reads count toward totals but no year's goal.
    completedAt: isCompleted ? finishedAt : null,
    stoppedAt: isStopped ? now : null,
    timesRead: isCompleted ? 1 : 0,
    rating: (isCompleted || shelf === "DNF") && parsedRating.data ? parsedRating.data : null,
    // Added privately: only the reader sees it (lib/privacy.ts sharedBookWhere).
    ...(isPrivate === true && { isPrivate: true }),
  }
})
// Two adds of one book at once both pass the check above (the catalogue lookup between takes seconds).
// Each then looks again: the oldest copy stays, and any later one is taken back before it's logged.
const [kept] = await shelfCopies(currentUser.id, book)
if (kept && kept.id !== book.id) {
  await prisma.book.delete({ where: { id: book.id } })
  return NextResponse.json(alreadyShelved(kept), { status: 409 })
}
// The work's series, the first time anyone shelves it (lib/seriesFill.ts), while the rest is saved.
const seriesFilled = fillWorkSeriesQuietly(book.workId)
const firstRead = readFromBook(book)
if (firstRead) await prisma.bookRead.create({ data: firstRead })
// Backfilled reads are logged as an add so they don't post "finished" to followers' feeds.
// Will not read is private, so it isn't logged at all.
if (shelf !== "NOT_INTERESTED") await prisma.activity.create({
  data: {
    userId: currentUser.id,
    bookId: book.id,
    type: shelf === "STARTED" ? "STARTED_BOOK" : finishedThisYearNow ? "COMPLETED_BOOK" : "ADDED_BOOK",
  }
})
// Adding a finished book can earn medals; the app celebrates what comes back.
const earnMoment = isCompleted ? await earnMomentFor(currentUser, await syncAchievements(currentUser.id), { finished: finishedThisYearNow }) : null
await seriesFilled
return NextResponse.json({ ...book, earnMoment })
}
