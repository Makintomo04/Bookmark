import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

async function getOwnedNote(bookId: string, noteId: string, currentUserId: string) {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: { book: true },
  })
  if (!note || note.bookId !== bookId) {
    return { error: NextResponse.json({ error: 'Note Not Found' }, { status: 404 }) }
  }
  if (note.book.userId !== currentUserId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { note }
}

export async function PATCH(request: Request, { params }: { params: { bookId: string, noteId: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const { note, error } = await getOwnedNote(params.bookId, params.noteId, currentUser.id)
  if (error) return error

  const body = await request.json()
  const { title, content } = body
  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 });
  }

  const updated = await prisma.note.update({
    where: { id: params.noteId },
    data: { title: title || null, content: content.trim() }
  })
  return NextResponse.json(updated)
}

export async function DELETE(request: Request, { params }: { params: { bookId: string, noteId: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const { error } = await getOwnedNote(params.bookId, params.noteId, currentUser.id)
  if (error) return error

  await prisma.note.delete({ where: { id: params.noteId } })
  return NextResponse.json({ success: true })
}
