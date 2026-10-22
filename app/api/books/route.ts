import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { awardNewAchievements } from "@/lib/achievements";
import { catalogIds, linkCatalog, type Resolved } from "@/lib/catalog";
import { normaliseWorkKey } from "@/lib/workKey";
import { DESCRIPTION_MAX, workDescription } from "@/lib/openLibrary";
import { RATING_ERROR, ratingSchema, readFromBook } from "@/lib/readHistory";
import { EditionFormat, Status } from "@prisma/client";
import { z } from "zod";
import { parseAudioMinutes } from "@/lib/bookInput";

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

export async function GET(req:Request, res:Response) {

const { user: currentUser, response } = await requireUser();
if (response) return response;

const books = await prisma.book.findMany({
  where:{
    userId: currentUser.id
  },
})
// "Recommended by" is shown to the reader only: a Bookmark user by @username, otherwise the name they typed.
const recommenderIds = Array.from(new Set(books.flatMap((b) => (b.recommendedById ? [b.recommendedById] : []))))
const recommenders = recommenderIds.length > 0
  ? await prisma.user.findMany({ where: { id: { in: recommenderIds } }, select: { id: true, username: true } })
  : []
const usernameById = new Map(recommenders.map((u) => [u.id, u.username]))
return NextResponse.json(books.map((b) => {
  const username = b.recommendedById ? usernameById.get(b.recommendedById) : null
  return { ...b, recommendedBy: username ? `@${username}` : b.recommendedByName ?? null }
}))
}
export async function POST(req:Request, res:Response) {

  const body = await req.json()
  const { title, author, coverImgSrc, pages, status, currentPage, currentMinute, finishedThisYear, rating, genre, workKey, description, editionKey, isbn13, isbn10, format, audioMinutes } = body
const { user: currentUser, response } = await requireUser();
if (response) return response;

if (typeof title !== "string" || !title.trim() || typeof author !== "string" || !author.trim()) {
  return NextResponse.json({ error: "Title and author are required" }, { status: 400 })
}
const parsedFormat = z.nativeEnum(EditionFormat).safeParse(format)
// An audiobook runs on minutes listened; its page count is optional (Open Library often knows the
// print length, which keeps "pages read" stats honest, but nobody has to type it).
const isAudiobook = parsedFormat.success && parsedFormat.data === "AUDIOBOOK"
const runningTime = isAudiobook ? parseAudioMinutes(audioMinutes) : null
if (isAudiobook && !runningTime) {
  return NextResponse.json({ error: "Enter the audiobook's running time" }, { status: 400 })
}
const totalPages = pages === undefined || pages === null || pages === "" ? (isAudiobook ? 0 : NaN) : parseInt(pages)
if (isNaN(totalPages) || totalPages < (isAudiobook ? 0 : 1)) {
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
const isStopped = shelf === "DNF" || shelf === "PAUSED"
const startPage = Math.max(0, Math.min(totalPages, parseInt(currentPage) || 0))
const startMinute = runningTime ? Math.max(0, Math.min(runningTime, parseInt(currentMinute) || 0)) : 0
// The shared catalog: the Work and Edition this copy is of. A search hit carries its work key and
// usually an edition key or ISBN; a book typed in by hand is filed by title and author.
const catalog = await linkCatalog(
  {
    workKey: optionalText.safeParse(workKey).success ? str(workKey) : null,
    editionKey: optionalText.safeParse(editionKey).success ? str(editionKey) : null,
    isbn13: optionalText.safeParse(isbn13).success ? str(isbn13) : null,
    isbn10: optionalText.safeParse(isbn10).success ? str(isbn10) : null,
    title: title.trim(),
    author: author.trim(),
    pages: totalPages > 0 ? totalPages : null,
    audioMinutes: runningTime,
    coverUrl: str(coverImgSrc),
    description: str(description)?.slice(0, DESCRIPTION_MAX) ?? null,
    format: parsedFormat.success ? parsedFormat.data : null,
  },
  { lookup: true, describe: true },
)
const book = await prisma.book.create({
  data:{
    userId: currentUser.id,
    title: title.trim(),
    author: author.trim(),
    coverImage: coverImgSrc || "",
    pages: totalPages,
    status: shelf,
    genre: genre || null,
    workKey: normaliseWorkKey(workKey) ?? catalog?.work.openLibraryKey ?? null,
    ...catalogIds(catalog),
    description: await resolveDescription(description, workKey, catalog),
    // The start date only feeds a "Started 3 Mar" label, so default it to today rather than asking.
    startedAt: shelf === "STARTED" ? now : null,
    currentPage: isCompleted ? totalPages : shelf === "STARTED" || isStopped ? startPage : 0,
    progressUnit: runningTime ? "MINUTES" : null,
    audioMinutes: runningTime,
    currentMinute: runningTime ? (isCompleted ? runningTime : shelf === "STARTED" || isStopped ? startMinute : 0) : null,
    // Past reads stay undated so they don't count toward this year's goal;
    // only a book the user says they finished this year gets a completion date.
    completedAt: isCompleted && finishedThisYear ? now : null,
    stoppedAt: isStopped ? now : null,
    timesRead: isCompleted ? 1 : 0,
    rating: (isCompleted || shelf === "DNF") && parsedRating.data ? parsedRating.data : null,
  }
})
const firstRead = readFromBook(book)
if (firstRead) await prisma.bookRead.create({ data: firstRead })
// Backfilled reads are logged as an add so they don't post "finished" to followers' feeds.
// Will not read is private, so it isn't logged at all.
if (shelf !== "NOT_INTERESTED") await prisma.activity.create({
  data: {
    userId: currentUser.id,
    bookId: book.id,
    type: shelf === "STARTED" ? "STARTED_BOOK" : isCompleted && finishedThisYear ? "COMPLETED_BOOK" : "ADDED_BOOK",
  }
})
if (isCompleted) await awardNewAchievements(currentUser.id)
return NextResponse.json(book)
}
