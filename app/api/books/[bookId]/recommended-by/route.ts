import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { isObjectId } from "@/lib/buddyReadsServer";
import { RECOMMENDED_BY_MAX } from "@/lib/recommendRules";

const bodySchema = z.object({ name: z.string().trim().max(RECOMMENDED_BY_MAX, `Keep it to ${RECOMMENDED_BY_MAX} characters`) });

// Sets who recommended a book as free text (a friend who isn't on Bookmark, a podcast, a shop). Typing over
// a Bookmark recommender replaces them; an empty name clears it. Only the reader ever sees this.
export async function PUT(req: Request, { params }: { params: { bookId: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  if (!isObjectId(params.bookId)) return NextResponse.json({ error: "No Book Found" }, { status: 404 });
  const book = await prisma.book.findUnique({ where: { id: params.bookId }, select: { userId: true } });
  if (!book) return NextResponse.json({ error: "No Book Found" }, { status: 404 });
  if (book.userId !== currentUser.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const updated = await prisma.book.update({
    where: { id: params.bookId },
    data: { recommendedByName: parsed.data.name || null, recommendedById: null },
    select: { id: true, recommendedByName: true },
  });
  return NextResponse.json(updated);
}
