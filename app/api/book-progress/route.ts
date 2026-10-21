import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { awardNewAchievements } from "@/lib/achievements";
import { onBuddyReadProgress } from "@/lib/buddyReadsServer";
import { OPEN_READ_STATUSES, RATING_ERROR, ratingInputSchema, readFromBook } from "@/lib/readHistory";
import { Prisma, type ActivityType, type Book, type Status } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const ACTIONS = ["start", "progress", "complete", "rate", "pause", "resume", "dnf", "restart", "wantToRead"] as const
type Action = typeof ACTIONS[number]

// Which shelf each action can be taken from.
const ALLOWED_FROM: Record<Action, Status[]> = {
  start: ["NOT_STARTED"],
  progress: ["STARTED"],
  complete: ["STARTED", "PAUSED"],
  rate: ["COMPLETED", "DNF"],
  pause: ["STARTED"],
  resume: ["PAUSED"],
  dnf: ["STARTED", "PAUSED"],
  restart: ["COMPLETED", "DNF"],
  wantToRead: ["STARTED", "PAUSED", "DNF"],
}

const NOT_ALLOWED: Record<Action, string> = {
  start: "This book has already been started",
  progress: "Only a book you're reading can have its progress updated",
  complete: "Only a book you're reading can be marked as finished",
  rate: "Only a finished or unfinished book can be rated here",
  pause: "Only a book you're reading can be paused",
  resume: "Only a paused book can be resumed",
  dnf: "Only a book you're reading can be marked as did not finish",
  restart: "Only a finished or unfinished book can be read again",
  wantToRead: "This book can't be moved back to Want to read",
}

const bodySchema = z.object({
  id: z.string().min(1, "id is required"),
  action: z.enum(ACTIONS).optional(),
  // An absolute page is idempotent, unlike pagesUpdate (an increment), so retries can't double-count.
  currentPage: z.number().finite().optional(),
  pagesUpdate: z.union([z.string(), z.number()]).optional(),
  rating: ratingInputSchema.optional(),
  review: z.string().max(2000, "Review must be 2000 characters or fewer").optional(),
  // Spoiler reviews show collapsed behind a click-to-reveal; private ones only to the reader (lib/privacy.ts).
  reviewSpoiler: z.boolean().optional(),
  reviewPrivate: z.boolean().optional(),
  // Older clients sent flags instead of an action.
  isStarted: z.boolean().optional(),
  isComplete: z.boolean().optional(),
  isRestart: z.boolean().optional(),
})
type Body = z.infer<typeof bodySchema>

function legacyAction(body: Body, status: Status): Action | undefined {
  if (body.isRestart) return "restart"
  if (body.isComplete) return status === "COMPLETED" ? "rate" : "complete"
  if (status === "NOT_STARTED") return body.isStarted ? "start" : undefined
  return "progress"
}

type Tx = Prisma.TransactionClient

// Updates the book's open read, or creates it from the book's fields if the book predates BookRead
// (the backfill hasn't run, or missed it).
async function updateOpenRead(tx: Tx, book: Book, data: Prisma.BookReadUncheckedUpdateInput) {
  const open = await tx.bookRead.findFirst({
    where: { bookId: book.id, status: { in: [...OPEN_READ_STATUSES] } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (open) return tx.bookRead.update({ where: { id: open.id }, data })
  const fromBook = readFromBook(book)!
  return tx.bookRead.create({ data: { ...fromBook, ...data } as Prisma.BookReadUncheckedCreateInput })
}

export async function POST(req: Request) {
  const { user: currentUser, response } = await requireUser()
  if (response) return response

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const error = issue?.path[0] === "rating" ? RATING_ERROR : issue?.message ?? "Invalid request"
    return NextResponse.json({ error }, { status: 400 })
  }
  const body = parsed.data
  const { id, rating, review, reviewSpoiler, reviewPrivate } = body

  const book = await prisma.book.findUnique({ where: { id } })
  if (!book) {
    return NextResponse.json({ error: 'Book Not Found' }, { status: 404 })
  }
  if (book.userId !== currentUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const action = body.action ?? legacyAction(body, book.status)
  if (!action) {
    return NextResponse.json({ error: 'Book not started' }, { status: 400 })
  }
  if (!ALLOWED_FROM[action].includes(book.status)) {
    return NextResponse.json({ error: NOT_ALLOWED[action] }, { status: 400 })
  }

  const clampPage = (page: number) => Math.max(0, Math.min(book.pages, Math.round(page)))
  const increment = body.pagesUpdate === undefined ? NaN : parseInt(String(body.pagesUpdate))
  const page = body.currentPage !== undefined ? clampPage(body.currentPage)
    : !isNaN(increment) ? clampPage((book.currentPage ?? 0) + increment)
    : undefined
  if (action === "progress" && page === undefined) {
    return NextResponse.json({ error: "Pages to increment must be greater than 0" }, { status: 400 })
  }

  const now = new Date()
  const ratingForRead = rating !== undefined ? rating : book.rating

  let updated: Book
  try {
    updated = await prisma.$transaction(async (tx) => {
      let data: Prisma.BookUpdateInput = {}
      switch (action) {
        case "start":
        case "restart":
          // A re-read is a new row: the finished (or abandoned) read keeps its own dates and rating.
          await tx.bookRead.create({ data: { bookId: book.id, userId: book.userId, status: "STARTED", startedAt: now } })
          // completedAt stays as the last finish; goal and stats only count it while the status is COMPLETED.
          data = { status: "STARTED", startedAt: now, stoppedAt: null, currentPage: action === "start" ? page ?? 0 : 0 }
          break
        case "progress":
          data = { currentPage: page }
          break
        case "complete":
          await updateOpenRead(tx, book, { status: "COMPLETED", finishedAt: now, rating: ratingForRead })
          data = { status: "COMPLETED", completedAt: now, stoppedAt: null, currentPage: book.pages, timesRead: { increment: 1 } }
          break
        case "rate": {
          // The rating belongs to the read that just ended, as well as to the book.
          const latest = await tx.bookRead.findFirst({
            where: { bookId: book.id, status: book.status },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          })
          if (latest && rating !== undefined) await tx.bookRead.update({ where: { id: latest.id }, data: { rating } })
          else if (!latest) await tx.bookRead.create({ data: { ...readFromBook(book)!, rating: ratingForRead } })
          break
        }
        case "pause":
          await updateOpenRead(tx, book, { status: "PAUSED" })
          data = { status: "PAUSED", stoppedAt: now, currentPage: page ?? book.currentPage }
          break
        case "resume":
          await updateOpenRead(tx, book, { status: "STARTED" })
          data = { status: "STARTED", stoppedAt: null, currentPage: page ?? book.currentPage }
          break
        case "dnf": {
          const stoppedAtPage = page ?? book.currentPage ?? 0
          await updateOpenRead(tx, book, { status: "DNF", finishedAt: now, stoppedAtPage, rating: ratingForRead })
          data = { status: "DNF", stoppedAt: now, currentPage: stoppedAtPage }
          break
        }
        case "wantToRead":
          // A read put back on the shelf mid-way wasn't really a read; a DNF stays in the history.
          await tx.bookRead.deleteMany({ where: { bookId: book.id, status: { in: [...OPEN_READ_STATUSES] } } })
          data = { status: "NOT_STARTED", startedAt: null, stoppedAt: null, currentPage: 0 }
          break
      }
      if (rating !== undefined) data.rating = rating
      if (review !== undefined) data.review = review
      if (reviewSpoiler !== undefined) data.reviewSpoiler = reviewSpoiler
      if (reviewPrivate !== undefined) data.reviewPrivate = reviewPrivate
      // Matching the status we checked makes a concurrent change (another tab, a double submit) fail
      // with P2025 and roll the whole transaction back, instead of opening two reads.
      return tx.book.update({ where: { id: book.id, status: book.status }, data })
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "This book changed somewhere else. Refresh and try again." }, { status: 409 })
    }
    throw err
  }

  const activities: ActivityType[] = []
  if (action === "start" || action === "restart") activities.push("STARTED_BOOK")
  if (action === "complete") activities.push("COMPLETED_BOOK")
  if (action === "dnf") activities.push("DNF_BOOK")
  if (rating && rating !== book.rating) activities.push("RATED_BOOK")
  if (review !== undefined && review.trim().length > 0 && review !== book.review) activities.push("REVIEWED_BOOK")
  for (const type of activities) {
    await prisma.activity.create({ data: { userId: currentUser.id, bookId: book.id, type } })
  }
  await onBuddyReadProgress(currentUser.id, updated)
  await awardNewAchievements(currentUser.id)
  return NextResponse.json(updated)
}
