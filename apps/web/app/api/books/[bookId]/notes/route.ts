import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request, props: { params: Promise<{ bookId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const book = await prisma.book.findUnique({ where: { id: params.bookId } })
  if (!book) {
    return NextResponse.json({ error: 'No Book Found' }, { status: 404 });
  }
  if (book.userId !== currentUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const notes = await prisma.note.findMany({
    where: { bookId: params.bookId },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(notes)
}

export async function POST(request: Request, props: { params: Promise<{ bookId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const book = await prisma.book.findUnique({ where: { id: params.bookId } })
  if (!book) {
    return NextResponse.json({ error: 'No Book Found' }, { status: 404 });
  }
  if (book.userId !== currentUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json()
  const { title, content } = body
  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 });
  }

  const note = await prisma.note.create({
    data: {
      bookId: params.bookId,
      title: title || null,
      content: content.trim(),
    }
  })
  return NextResponse.json(note)
}
