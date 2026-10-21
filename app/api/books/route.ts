import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { awardNewAchievements } from "@/lib/achievements";
import { normaliseWorkKey } from "@/lib/workKey";
import { DESCRIPTION_MAX, workDescription } from "@/lib/openLibrary";
import { RATING_ERROR, ratingSchema, readFromBook } from "@/lib/readHistory";
import { Status } from "@prisma/client";
import { z } from "zod";

const statusSchema = z.nativeEnum(Status)

// The add-book modal sends the blurb it already showed; one-click adds from Discover don't,
// so look it up here. Never let a slow or failed lookup block saving the book.
async function resolveDescription(description: unknown, workKey: unknown) {
  if (typeof description === "string" && description.trim()) return description.trim().slice(0, DESCRIPTION_MAX)
  const key = normaliseWorkKey(typeof workKey === "string" ? workKey : null)
  return key ? workDescription(key).catch(() => null) : null
}
import { NextResponse } from "next/server";

// Covers are copied to UploadThing afterwards, by /api/books/[bookId]/cover.

export async function GET(req:Request, res:Response) {

const { user: currentUser, response } = await requireUser();
if (response) return response;

const books = await prisma.book.findMany({
  where:{
    userId: currentUser.id
  },
  include:{

  }
})
return NextResponse.json(books)
}
export async function POST(req:Request, res:Response) {

  const body = await req.json()
  const { title, author, coverImgSrc, pages, status, currentPage, finishedThisYear, rating, genre, workKey, description } = body
const { user: currentUser, response } = await requireUser();
if (response) return response;

const totalPages = parseInt(pages)
if (typeof title !== "string" || !title.trim() || typeof author !== "string" || !author.trim()) {
  return NextResponse.json({ error: "Title and author are required" }, { status: 400 })
}
if (isNaN(totalPages) || totalPages < 1) {
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
const book = await prisma.book.create({
  data:{
    userId: currentUser.id,
    title: title.trim(),
    author: author.trim(),
    coverImage: coverImgSrc || "",
    pages: totalPages,
    status: shelf,
    genre: genre || null,
    workKey: normaliseWorkKey(workKey),
    description: await resolveDescription(description, workKey),
    // The start date only feeds a "Started 3 Mar" label, so default it to today rather than asking.
    startedAt: shelf === "STARTED" ? now : null,
    currentPage: isCompleted ? totalPages : shelf === "STARTED" || isStopped ? startPage : 0,
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
await prisma.activity.create({
  data: {
    userId: currentUser.id,
    bookId: book.id,
    type: shelf === "STARTED" ? "STARTED_BOOK" : isCompleted && finishedThisYear ? "COMPLETED_BOOK" : "ADDED_BOOK",
  }
})
if (isCompleted) await awardNewAchievements(currentUser.id)
return NextResponse.json(book)
}
