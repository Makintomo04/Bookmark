import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { TAGS_PER_BOOK, TAG_MAX_LENGTH, cleanTags } from "@/lib/shelfTags";

const bodySchema = z.object({
  tags: z.array(z.string().max(TAG_MAX_LENGTH * 2)).max(TAGS_PER_BOOK * 2),
});

// Replaces a book's personal tags. Owner only; tags never leave the reader's own shelf and export.
export async function PUT(request: Request, { params }: { params: { bookId: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const book = await prisma.book.findUnique({ where: { id: params.bookId }, select: { userId: true } });
  if (!book) return NextResponse.json({ error: "No Book Found" }, { status: 404 });
  if (book.userId !== currentUser.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Up to ${TAGS_PER_BOOK} tags, each up to ${TAG_MAX_LENGTH} characters` }, { status: 400 });

  const tags = cleanTags(parsed.data.tags);
  await prisma.book.update({ where: { id: params.bookId }, data: { tags } });
  return NextResponse.json({ tags });
}
