import type { Prisma } from "@prisma/client";
import { bookFieldsFromReads } from "@/lib/readHistory";

// After a read is added, edited or deleted: the book's mirrored fields (timesRead, completedAt and the rest)
// worked out again from every read it has. Run inside the transaction that changed the read.
export async function resyncBookFromReads(tx: Prisma.TransactionClient, bookId: string) {
  const book = await tx.book.findUniqueOrThrow({ where: { id: bookId }, select: { status: true, rating: true } });
  const reads = await tx.bookRead.findMany({
    where: { bookId },
    select: { status: true, startedAt: true, finishedAt: true, rating: true, createdAt: true },
  });
  return tx.book.update({ where: { id: bookId }, data: bookFieldsFromReads(book, reads) });
}

// What the reads API sends back for each read (hooks/useBookReads.ts BookReadEntry).
export const readEntrySelect = {
  id: true, status: true, startedAt: true, finishedAt: true, rating: true, stoppedAtPage: true, stoppedAtMinute: true, currentPercent: true,
} as const;
