import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { isObjectId } from "@/lib/buddyReadsServer";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { RECOMMEND_MAX_FRIENDS, RECOMMEND_MESSAGE_MAX, mutualFollowIds, recommendFriends } from "@/lib/recommendations";

const sendSchema = z.object({
  usernames: z.array(z.string().trim().min(1).max(60)).min(1, "Pick at least one friend").max(RECOMMEND_MAX_FRIENDS, `Pick up to ${RECOMMEND_MAX_FRIENDS} friends`),
  message: z.string().trim().max(RECOMMEND_MESSAGE_MAX, `Keep the note to ${RECOMMEND_MESSAGE_MAX} characters`).optional(),
});

// Only books on your own shelf can be sent: the notification points at your copy.
async function ownBook(bookId: string, userId: string) {
  if (!isObjectId(bookId)) return null;
  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true, userId: true, title: true, author: true, workKey: true, status: true } });
  return book && book.userId === userId && book.status !== "NOT_INTERESTED" ? book : null;
}

// The friends this book can be sent to.
export async function GET(_req: Request, { params }: { params: { bookId: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const book = await ownBook(params.bookId, currentUser.id);
  if (!book) return NextResponse.json({ error: "Book Not Found" }, { status: 404 });
  return NextResponse.json({ friends: await recommendFriends(currentUser.id, book) });
}

export async function POST(req: Request, { params }: { params: { bookId: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const book = await ownBook(params.bookId, currentUser.id);
  if (!book) return NextResponse.json({ error: "Book Not Found" }, { status: 404 });

  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const limit = rateLimit(`book-recommend:${currentUser.id}`, 30, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });

  const usernames = Array.from(new Set(parsed.data.usernames.map((u) => u.replace(/^@/, ""))));
  const [friendIds, recipients] = await Promise.all([
    mutualFollowIds(currentUser.id),
    prisma.user.findMany({ where: { username: { in: usernames } }, select: { id: true } }),
  ]);
  const friends = new Set(friendIds);
  const ids = recipients.map((r) => r.id).filter((id) => friends.has(id));
  if (ids.length === 0) return NextResponse.json({ error: "You can only send books to friends who follow you back." }, { status: 403 });

  // Sending the same book to the same friend twice is a no-op, so nobody is nagged.
  const already = await prisma.notification.findMany({
    where: { actorId: currentUser.id, type: "BOOK_RECOMMENDED", bookId: book.id, userId: { in: ids } },
    select: { userId: true },
  });
  const sentBefore = new Set(already.map((n) => n.userId));
  const fresh = ids.filter((id) => !sentBefore.has(id));
  const message = parsed.data.message || null;
  if (fresh.length > 0) {
    await prisma.notification.createMany({
      data: fresh.map((userId) => ({ userId, actorId: currentUser.id, type: "BOOK_RECOMMENDED" as const, bookId: book.id, message })),
    });
  }
  return NextResponse.json({ sent: fresh.length, alreadySent: sentBefore.size });
}
