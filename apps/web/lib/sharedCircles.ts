import prisma from "@/lib/db";
import { progressPercent, progressSelect } from "@/lib/progress";
import { circleProgress } from "@/lib/buddyReads";

// A reading circle the viewer and a reader are both in, keyed by the reader's own shelf book: where the rest of
// the circle is (the middle of the other members' progress), for pinning that book first on the reader's
// profile. Only circles the viewer is in, so nothing about a circle reaches anyone outside it.
export interface SharedCircle {
  bookId: string;
  circleId: string;
  at: number | null;
}

export async function sharedCircles(viewerId: string, readerId: string): Promise<SharedCircle[]> {
  if (viewerId === readerId) return [];
  const viewerIn = await prisma.buddyReadMember.findMany({ where: { userId: viewerId }, select: { buddyReadId: true } });
  if (viewerIn.length === 0) return [];
  const active = await prisma.buddyRead.findMany({
    where: { id: { in: viewerIn.map((m) => m.buddyReadId) }, status: "ACTIVE" },
    select: { id: true },
  });
  const readerIn = await prisma.buddyReadMember.findMany({
    where: { userId: readerId, buddyReadId: { in: active.map((c) => c.id) } },
    select: { buddyReadId: true, bookId: true },
  });
  if (readerIn.length === 0) return [];

  const others = await prisma.buddyReadMember.findMany({
    where: { buddyReadId: { in: readerIn.map((m) => m.buddyReadId) }, userId: { not: readerId } },
    select: { buddyReadId: true, userId: true, bookId: true, notifiedProgress: true },
  });
  const books = await prisma.book.findMany({ where: { id: { in: others.map((m) => m.bookId) } }, select: { id: true, userId: true, ...progressSelect } });
  const bookById = new Map(books.map((b) => [b.id, b]));

  return readerIn.map((m) => {
    // As the circle page counts it: a member's own book, never lower than the furthest they've reached.
    const progress = others
      .filter((o) => o.buddyReadId === m.buddyReadId)
      .map((o) => {
        const book = bookById.get(o.bookId);
        return circleProgress(book?.userId === o.userId ? progressPercent(book) : 0, o.notifiedProgress);
      })
      .sort((a, b) => a - b);
    return { bookId: m.bookId, circleId: m.buddyReadId, at: progress.length ? progress[Math.floor((progress.length - 1) / 2)] : null };
  });
}
