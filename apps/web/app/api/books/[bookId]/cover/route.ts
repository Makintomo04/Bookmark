import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { isOpenLibraryCoverUrl, mirrorCover } from "@/lib/covers";
import { NextResponse } from "next/server";

// Copying a cover to UploadThing can take up to ~20s, so it runs here, after the book is saved
// with its Open Library URL, rather than holding up the save. The client calls this without waiting.
export const maxDuration = 30;

export async function POST(_req: Request, props: { params: Promise<{ bookId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const book = await prisma.book.findUnique({ where: { id: params.bookId }, select: { id: true, userId: true, coverImage: true, workId: true, editionId: true } });
  if (!book || book.userId !== currentUser.id) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  if (!book.coverImage || !isOpenLibraryCoverUrl(book.coverImage)) return NextResponse.json({ coverImage: book.coverImage });

  const copy = await mirrorCover(book.coverImage);
  if (copy !== book.coverImage) {
    // Only if the cover hasn't been changed again in the meantime. The catalog rows hotlinking the same
    // Open Library cover take the copy too, so the shared cover outlives Open Library's cover server.
    await Promise.all([
      prisma.book.updateMany({ where: { id: book.id, coverImage: book.coverImage }, data: { coverImage: copy } }),
      book.editionId && prisma.edition.updateMany({ where: { id: book.editionId, coverUrl: book.coverImage }, data: { coverUrl: copy } }),
      book.workId && prisma.work.updateMany({ where: { id: book.workId, coverUrl: book.coverImage }, data: { coverUrl: copy } }),
    ]);
  }
  return NextResponse.json({ coverImage: copy });
}
