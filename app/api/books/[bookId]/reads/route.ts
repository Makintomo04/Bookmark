import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

// A book's read history, oldest first. Owner only, like the book itself.
export async function GET(request: Request, { params }: { params: { bookId: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const book = await prisma.book.findUnique({ where: { id: params.bookId }, select: { userId: true } });
  if (!book) {
    return NextResponse.json({ error: "No Book Found" }, { status: 404 });
  }
  if (book.userId !== currentUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reads = await prisma.bookRead.findMany({
    where: { bookId: params.bookId },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, startedAt: true, finishedAt: true, rating: true, stoppedAtPage: true },
  });
  return NextResponse.json(reads);
}
