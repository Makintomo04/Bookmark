import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { awardNewAchievements } from "@/lib/achievements";
import { mirrorCover } from "@/lib/covers";
import { normaliseWorkKey } from "@/lib/workKey";
import { DESCRIPTION_MAX, workDescription } from "@/lib/openLibrary";

// The add-book modal sends the blurb it already showed; one-click adds from Discover don't,
// so look it up here. Never let a slow or failed lookup block saving the book.
async function resolveDescription(description: unknown, workKey: unknown) {
  if (typeof description === "string" && description.trim()) return description.trim().slice(0, DESCRIPTION_MAX)
  const key = normaliseWorkKey(typeof workKey === "string" ? workKey : null)
  return key ? workDescription(key).catch(() => null) : null
}
import { NextResponse } from "next/server";

// Copying a cover to UploadThing can take up to ~20s.
export const maxDuration = 30;

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
if (!["NOT_STARTED", "STARTED", "COMPLETED"].includes(status)) {
  return NextResponse.json({ error: "Invalid status" }, { status: 400 })
}
if (rating !== undefined && (typeof rating !== "number" || rating < 1 || rating > 5)) {
  return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 })
}

const now = new Date()
const isCompleted = status === "COMPLETED"
const startPage = Math.max(0, Math.min(totalPages, parseInt(currentPage) || 0))
const book = await prisma.book.create({
  data:{
    userId: currentUser.id,
    title: title.trim(),
    author: author.trim(),
    coverImage: coverImgSrc ? await mirrorCover(coverImgSrc) : "",
    pages: totalPages,
    status,
    genre: genre || null,
    workKey: normaliseWorkKey(workKey),
    description: await resolveDescription(description, workKey),
    // The start date only feeds a "Started 3 Mar" label, so default it to today rather than asking.
    startedAt: status === "STARTED" ? now : null,
    currentPage: isCompleted ? totalPages : status === "STARTED" ? startPage : 0,
    // Past reads stay undated so they don't count toward this year's goal;
    // only a book the user says they finished this year gets a completion date.
    completedAt: isCompleted && finishedThisYear ? now : null,
    timesRead: isCompleted ? 1 : 0,
    rating: isCompleted && rating ? rating : null,
  }
})
// Backfilled reads are logged as an add so they don't post "finished" to followers' feeds.
await prisma.activity.create({
  data: {
    userId: currentUser.id,
    bookId: book.id,
    type: status === "STARTED" ? "STARTED_BOOK" : isCompleted && finishedThisYear ? "COMPLETED_BOOK" : "ADDED_BOOK",
  }
})
if (isCompleted) await awardNewAchievements(currentUser.id)
return NextResponse.json(book)
}
