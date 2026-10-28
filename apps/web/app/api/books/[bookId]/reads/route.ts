import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { syncAchievements } from "@/lib/achievements";
import { lengthSnapshot } from "@/lib/progress";
import { RATING_ERROR, optionalDaySchema, ratingInputSchema, readCreatedAt } from "@/lib/readHistory";
import { readEntrySelect, resyncBookFromReads } from "@/lib/readSync";

async function ownBook(bookId: string, userId: string) {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return { error: NextResponse.json({ error: "No Book Found" }, { status: 404 }) };
  if (book.userId !== userId) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { book };
}

// A book's read history, oldest first. Owner only, like the book itself.
export async function GET(request: Request, props: { params: Promise<{ bookId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const owned = await ownBook(params.bookId, currentUser.id);
  if ("error" in owned) return owned.error;

  const reads = await prisma.bookRead.findMany({
    where: { bookId: params.bookId },
    orderBy: { createdAt: "asc" },
    select: readEntrySelect,
  });
  return NextResponse.json(reads);
}

const pastReadSchema = z.object({
  // Only ended reads can be added after the fact: an open one comes from starting the book.
  status: z.enum(["COMPLETED", "DNF"]),
  startedAt: optionalDaySchema.optional(),
  finishedAt: optionalDaySchema.optional(),
  rating: ratingInputSchema.optional(),
}).refine((r) => !r.startedAt || !r.finishedAt || r.startedAt <= r.finishedAt, { message: "The start date is after the finish date", path: ["startedAt"] });

// Logs a past read: a re-read from years ago, or a finish the reader forgot to record. It goes into the
// history at its dates, and the book's read count, dates and stats follow.
export async function POST(request: Request, props: { params: Promise<{ bookId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const owned = await ownBook(params.bookId, currentUser.id);
  if ("error" in owned) return owned.error;
  const { book } = owned;
  if (book.status === "NOT_STARTED" || book.status === "NOT_INTERESTED") {
    return NextResponse.json({ error: "Move the book to Finished first, then add earlier reads" }, { status: 400 });
  }

  const parsed = pastReadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.path[0] === "rating" ? RATING_ERROR : issue?.message ?? "Invalid request" }, { status: 400 });
  }
  const { status, startedAt = null, finishedAt = null, rating = null } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const others = await tx.bookRead.findMany({ where: { bookId: book.id }, select: { status: true, startedAt: true, finishedAt: true, rating: true, createdAt: true } });
    await tx.bookRead.create({
      data: {
        bookId: book.id, userId: book.userId, status, startedAt, finishedAt, rating,
        ...lengthSnapshot(book),
        createdAt: readCreatedAt({ startedAt, finishedAt }, others),
      },
    });
    await resyncBookFromReads(tx, book.id);
  });
  // A past finish can complete a ladder rung (books read, re-reads). Logged quietly: no feed post.
  await syncAchievements(currentUser.id);
  const reads = await prisma.bookRead.findMany({ where: { bookId: book.id }, orderBy: { createdAt: "asc" }, select: readEntrySelect });
  return NextResponse.json(reads, { status: 201 });
}
