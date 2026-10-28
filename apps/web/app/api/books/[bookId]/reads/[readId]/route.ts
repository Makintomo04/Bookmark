import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { syncAchievements } from "@/lib/achievements";
import { OPEN_READ_STATUSES, RATING_ERROR, optionalDaySchema, ratingInputSchema, readCreatedAt } from "@/lib/readHistory";
import { readEntrySelect, resyncBookFromReads } from "@/lib/readSync";
import type { Status } from "@prisma/client";

type Params = { params: Promise<{ bookId: string; readId: string }> };

const isOpen = (status: Status) => (OPEN_READ_STATUSES as readonly Status[]).includes(status);

async function ownRead({ bookId, readId }: Awaited<Params["params"]>, userId: string) {
  if (!/^[a-f0-9]{24}$/i.test(readId)) return { error: NextResponse.json({ error: "No read found" }, { status: 404 }) };
  const read = await prisma.bookRead.findUnique({ where: { id: readId } });
  if (!read || read.bookId !== bookId) return { error: NextResponse.json({ error: "No read found" }, { status: 404 }) };
  if (read.userId !== userId) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { read };
}

const editSchema = z.object({
  startedAt: optionalDaySchema.optional(),
  finishedAt: optionalDaySchema.optional(),
  rating: ratingInputSchema.optional(),
});

// Fixes a read's dates or its rating. An open read only has a start date; its progress is logged as usual.
export async function PATCH(request: Request, props: Params) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const owned = await ownRead(params, currentUser.id);
  if ("error" in owned) return owned.error;
  const { read } = owned;

  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.path[0] === "rating" ? RATING_ERROR : issue?.message ?? "Invalid request" }, { status: 400 });
  }
  const edit = parsed.data;
  if (isOpen(read.status) && (edit.finishedAt !== undefined || edit.rating !== undefined)) {
    return NextResponse.json({ error: "Only the start date of a read in progress can be changed" }, { status: 400 });
  }
  const startedAt = edit.startedAt !== undefined ? edit.startedAt : read.startedAt;
  const finishedAt = edit.finishedAt !== undefined ? edit.finishedAt : read.finishedAt;
  if (startedAt && finishedAt && startedAt > finishedAt) {
    return NextResponse.json({ error: "The start date is after the finish date" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    const others = await tx.bookRead.findMany({
      where: { bookId: read.bookId, id: { not: read.id } },
      select: { status: true, startedAt: true, finishedAt: true, rating: true, createdAt: true },
    });
    const moved = !isOpen(read.status) && (edit.startedAt !== undefined || edit.finishedAt !== undefined);
    await tx.bookRead.update({
      where: { id: read.id },
      data: {
        startedAt,
        finishedAt,
        ...(edit.rating !== undefined && { rating: edit.rating }),
        // Ended reads move to where their new dates put them; the open read stays the latest.
        ...(moved && { createdAt: readCreatedAt({ startedAt, finishedAt }, others) }),
      },
    });
    const book = await resyncBookFromReads(tx, read.bookId);
    // Clearing the rating of the read the shelf shows clears the book's rating too.
    if (edit.rating === null && book.status === read.status && book.rating !== null) {
      const latest = await tx.bookRead.findFirst({ where: { bookId: read.bookId, status: read.status }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (latest?.id === read.id) await tx.book.update({ where: { id: read.bookId }, data: { rating: null } });
    }
  });
  await syncAchievements(currentUser.id);
  const reads = await prisma.bookRead.findMany({ where: { bookId: read.bookId }, orderBy: { createdAt: "asc" }, select: readEntrySelect });
  return NextResponse.json(reads);
}

// Removes a read logged by mistake. The read in progress, and the only read behind a Finished or Did not
// finish shelf, stay: moving the book to another shelf is how those are undone.
export async function DELETE(request: Request, props: Params) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const owned = await ownRead(params, currentUser.id);
  if ("error" in owned) return owned.error;
  const { read } = owned;
  if (isOpen(read.status)) {
    return NextResponse.json({ error: "This is the read in progress. Move the book to another shelf instead" }, { status: 400 });
  }
  const book = await prisma.book.findUniqueOrThrow({ where: { id: read.bookId }, select: { status: true } });
  if (book.status === read.status) {
    const same = await prisma.bookRead.count({ where: { bookId: read.bookId, status: read.status } });
    if (same <= 1) {
      return NextResponse.json({ error: "This is the book's only read on this shelf. Move the book to another shelf instead" }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.bookRead.delete({ where: { id: read.id } });
    await resyncBookFromReads(tx, read.bookId);
  });
  await syncAchievements(currentUser.id);
  const reads = await prisma.bookRead.findMany({ where: { bookId: read.bookId }, orderBy: { createdAt: "asc" }, select: readEntrySelect });
  return NextResponse.json(reads);
}
