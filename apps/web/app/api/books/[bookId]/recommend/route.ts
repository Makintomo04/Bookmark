import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { isObjectId } from "@/lib/buddyReadsServer";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { recommendFriends, recommendSchema, sendRecommendation } from "@/lib/recommendations";

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

  const parsed = recommendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const limit = rateLimit(`book-recommend:${currentUser.id}`, 30, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });

  const result = await sendRecommendation(currentUser.id, { bookId: book.id }, parsed.data.usernames, parsed.data.message || null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ sent: result.sent, alreadySent: result.alreadySent });
}
