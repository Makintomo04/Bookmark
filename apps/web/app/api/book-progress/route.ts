import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { syncAchievements } from "@/lib/achievements";
import { earnMomentFor } from "@/lib/earnMomentServer";
import { progressTriggers } from "@/lib/achievementTriggers";
import { onBuddyReadProgress } from "@/lib/buddyReadsServer";
import { OPEN_READ_STATUSES, RATING_ERROR, RESHELVE_TARGETS, ratingInputSchema, readFromBook, reshelvedFields } from "@/lib/readHistory";
import { lengthSnapshot, progressScale } from "@/lib/progress";
import { positionFromBody } from "@/lib/progressPayload";
import { Prisma, type ActivityType, type Book, type Status } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const ACTIONS = ["start", "progress", "complete", "rate", "pause", "resume", "dnf", "restart", "wantToRead", "notInterested", "reshelve"] as const
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
  wantToRead: ["STARTED", "PAUSED", "DNF", "NOT_INTERESTED"],
  notInterested: ["NOT_STARTED"],
  // A correction, not a step in the read: any shelf to any other.
  reshelve: ["NOT_STARTED", "STARTED", "PAUSED", "COMPLETED", "DNF", "NOT_INTERESTED"],
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
  notInterested: "Only a book on Want to read can be marked as will not read",
  reshelve: "This book can't be moved",
}

// The read each shelf made, and what it posted to followers' feeds: what re-filing a book undoes.
const WRONG_READ: Partial<Record<Status, Prisma.BookReadWhereInput["status"]>> = {
  STARTED: { in: [...OPEN_READ_STATUSES] },
  PAUSED: { in: [...OPEN_READ_STATUSES] },
  COMPLETED: "COMPLETED",
  DNF: "DNF",
}
const WRONG_POST: Partial<Record<Status, ActivityType>> = {
  STARTED: "STARTED_BOOK",
  PAUSED: "STARTED_BOOK",
  COMPLETED: "COMPLETED_BOOK",
  DNF: "DNF_BOOK",
}

const bodySchema = z.object({
  id: z.string().min(1, "id is required"),
  action: z.enum(ACTIONS).optional(),
  // An absolute page is idempotent, unlike pagesUpdate (an increment), so retries can't double-count.
  currentPage: z.number().finite().optional(),
  pagesUpdate: z.union([z.string(), z.number()]).optional(),
  // Audiobooks: minutes listened, absolute or as an increment. Used only when the book runs on minutes.
  currentMinute: z.number().finite().optional(),
  minutesUpdate: z.union([z.string(), z.number()]).optional(),
  // Kindle readers: the place as a percent. Wins over a page or minute sent alongside it; the matching
  // position is stored with it when the book's length is known.
  currentPercent: z.number().min(0).max(100).optional(),
  // Remember percent entry for this book, on every device.
  logsPercent: z.boolean().optional(),
  rating: ratingInputSchema.optional(),
  review: z.string().max(2000, "Review must be 2000 characters or fewer").optional(),
  // Spoiler reviews show collapsed behind a click-to-reveal; private ones only to the reader (lib/privacy.ts).
  reviewSpoiler: z.boolean().optional(),
  reviewPrivate: z.boolean().optional(),
  // reshelve: the shelf the book should have gone on, and for Finished, whether it counts this year.
  to: z.enum(RESHELVE_TARGETS).optional(),
  finishedThisYear: z.boolean().optional(),
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
  const to = body.to
  if (action === "reshelve" && (!to || to === book.status)) {
    return NextResponse.json({ error: "Choose a different shelf" }, { status: 400 })
  }

  // The book's own scale: pages, or minutes for an audiobook (lib/progressPayload.ts). A percent comes
  // with its position worked out; a page or minute clears any percent logged before.
  const scale = progressScale(book)
  const onMinutes = scale.unit === "MINUTES"
  const { position, percent } = positionFromBody(book, body)
  if (action === "progress" && position === undefined) {
    return NextResponse.json({ error: onMinutes ? "Minutes to add must be greater than 0" : "Pages to increment must be greater than 0" }, { status: 400 })
  }
  // Book mirrors the open read: currentPage for a paper book, currentMinute for an audiobook, and the
  // percent (`logged`), set whenever a position was sent: a pause without one keeps the place as it was.
  const at = (n: number | null | undefined): Prisma.BookUpdateInput => (onMinutes ? { currentMinute: n ?? 0 } : { currentPage: n ?? 0 })
  const readAt = (n: number | null | undefined): Prisma.BookReadUncheckedUpdateInput => (onMinutes ? { currentMinute: n ?? 0 } : {})
  const logged = position !== undefined ? { currentPercent: percent } : {}
  const page = position

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
          await tx.bookRead.create({ data: { bookId: book.id, userId: book.userId, status: "STARTED", startedAt: now, ...(action === "start" && logged) } })
          // completedAt stays as the last finish; goal and stats only count it while the status is COMPLETED.
          data = { status: "STARTED", startedAt: now, stoppedAt: null, currentPage: 0, currentMinute: 0, currentPercent: null, ...at(action === "start" ? page ?? 0 : 0), ...(action === "start" && logged) }
          break
        case "progress":
          await updateOpenRead(tx, book, { ...readAt(page), ...logged })
          data = { ...at(page), ...logged }
          break
        case "complete":
          // The read keeps the format and length it was read in, whatever the book is changed to later.
          await updateOpenRead(tx, book, { status: "COMPLETED", finishedAt: now, rating: ratingForRead, ...lengthSnapshot(book), ...readAt(scale.total) })
          // A finished book is 100% whatever was logged, so the percent is cleared with the read.
          data = { status: "COMPLETED", completedAt: now, stoppedAt: null, currentPage: book.pages, currentPercent: null, timesRead: { increment: 1 }, ...(onMinutes && { currentMinute: scale.total }) }
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
          await updateOpenRead(tx, book, { status: "PAUSED", ...readAt(page ?? scale.current), ...logged })
          data = { status: "PAUSED", stoppedAt: now, ...at(page ?? scale.current), ...logged }
          break
        case "resume":
          await updateOpenRead(tx, book, { status: "STARTED", ...readAt(page ?? scale.current), ...logged })
          data = { status: "STARTED", stoppedAt: null, ...at(page ?? scale.current), ...logged }
          break
        case "dnf": {
          const stoppedAt = page ?? scale.current
          await updateOpenRead(tx, book, {
            status: "DNF", finishedAt: now, rating: ratingForRead, ...lengthSnapshot(book),
            ...(onMinutes ? { stoppedAtMinute: stoppedAt, currentMinute: stoppedAt } : { stoppedAtPage: stoppedAt }),
            // Final on a DNF: a book with no page count stopped at a percent, not at page 0.
            currentPercent: position !== undefined ? percent : book.currentPercent ?? null,
          })
          data = { status: "DNF", stoppedAt: now, ...at(stoppedAt), ...logged }
          break
        }
        case "wantToRead":
          // A read put back on the shelf mid-way wasn't really a read; a DNF stays in the history.
          await tx.bookRead.deleteMany({ where: { bookId: book.id, status: { in: [...OPEN_READ_STATUSES] } } })
          data = { status: "NOT_STARTED", startedAt: null, stoppedAt: null, currentPage: 0, currentMinute: 0, currentPercent: null }
          break
        case "notInterested":
          // Only from Want to read, so there's no open read to close.
          data = { status: "NOT_INTERESTED" }
          break
        case "reshelve": {
          // Put on the wrong shelf: drop the read that shelf made (the latest; earlier reads stay) and
          // file the book as if it had been added to the right one.
          const wrongRead = WRONG_READ[book.status]
          if (wrongRead) {
            const latest = await tx.bookRead.findFirst({ where: { bookId: book.id, status: wrongRead }, orderBy: { createdAt: "desc" }, select: { id: true } })
            if (latest) await tx.bookRead.delete({ where: { id: latest.id } })
          }
          const earlier = await tx.bookRead.findFirst({
            where: { bookId: book.id, status: { in: ["COMPLETED", "DNF"] }, rating: { not: null } },
            orderBy: { createdAt: "desc" },
            select: { rating: true },
          })
          const fields = reshelvedFields(book, to!, { now, finishedThisYear: !!body.finishedThisYear, rating, earlierRating: earlier?.rating ?? null })
          const read = readFromBook({ ...book, ...fields })
          if (read) await tx.bookRead.create({ data: read })
          data = { ...fields, ...(to === "STARTED" && { progressAt: now }) }
          break
        }
      }
      // When the reader last moved their place in the book (lib/recap.ts tells a book left untouched by it).
      if (action === "start" || action === "restart" || action === "progress" || action === "resume") data.progressAt = now
      if (body.logsPercent !== undefined) data.logsPercent = body.logsPercent
      if (rating !== undefined && action !== "reshelve") data.rating = rating
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
  if (action === "reshelve") {
    // Take the wrong shelf's post out of followers' feeds, and post the right one as adding a book would.
    const wrongPost = WRONG_POST[book.status]
    const post = wrongPost && await prisma.activity.findFirst({ where: { bookId: book.id, type: wrongPost }, orderBy: { createdAt: "desc" }, select: { id: true } })
    if (post) await prisma.activity.delete({ where: { id: post.id } })
    if (to === "STARTED") activities.push("STARTED_BOOK")
    if (to === "COMPLETED" && body.finishedThisYear) activities.push("COMPLETED_BOOK")
  }
  if (action === "start" || action === "restart") activities.push("STARTED_BOOK")
  if (action === "complete") activities.push("COMPLETED_BOOK")
  if (action === "dnf") activities.push("DNF_BOOK")
  if (rating && rating !== book.rating && updated.rating === rating) activities.push("RATED_BOOK")
  if (review !== undefined && review.trim().length > 0 && review !== book.review) activities.push("REVIEWED_BOOK")
  for (const type of activities) {
    await prisma.activity.create({ data: { userId: currentUser.id, bookId: book.id, type } })
  }
  await onBuddyReadProgress(currentUser.id, updated)
  const synced = await syncAchievements(currentUser.id, {
    trigger: progressTriggers({
      action: action === "reshelve" && to === "COMPLETED" ? "complete" : action,
      moved: updated.currentPage !== book.currentPage || updated.currentMinute !== book.currentMinute || updated.currentPercent !== book.currentPercent,
      rated: activities.includes("RATED_BOOK"),
      reviewed: activities.includes("REVIEWED_BOOK"),
    }),
  })
  // What this save earned, sent back with the book so the app can celebrate it there and then.
  const earnMoment = await earnMomentFor(currentUser, synced, { finished: action === "complete" || (action === "reshelve" && to === "COMPLETED" && !!body.finishedThisYear) })
  return NextResponse.json({ ...updated, earnMoment })
}
