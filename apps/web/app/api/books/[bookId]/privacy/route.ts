import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { isObjectId } from "@/lib/buddyReadsServer";

const bodySchema = z.object({ isPrivate: z.boolean() });

// Makes one book private (only the reader sees it, on whatever shelf) or shares it again. Its past feed
// posts follow along: the feed checks the book as it is now, not as it was when the post was made.
export async function PUT(req: Request, { params }: { params: { bookId: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  if (!isObjectId(params.bookId)) return NextResponse.json({ error: "No Book Found" }, { status: 404 });
  const book = await prisma.book.findUnique({ where: { id: params.bookId }, select: { userId: true } });
  if (!book) return NextResponse.json({ error: "No Book Found" }, { status: 404 });
  if (book.userId !== currentUser.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const updated = await prisma.book.update({
    where: { id: params.bookId },
    data: { isPrivate: parsed.data.isPrivate },
    select: { id: true, isPrivate: true },
  });
  return NextResponse.json(updated);
}
