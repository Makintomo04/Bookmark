// Gives every shelved book that has been started its BookRead history, from the dates on the book.
//
//   node --env-file=.env.local scripts/backfill-reads.ts --dry-run   # count what would be created
//   node --env-file=.env.local scripts/backfill-reads.ts             # create the reads
//
// Safe to re-run: a book that already has any read is skipped, so only books shelved before BookRead
// existed are picked up. Run `prisma db push` first so the BookRead collection and its indexes exist.
//
// A book read more than once only knows its latest dates, so earlier completed reads are created undated
// (no startedAt, finishedAt or rating). That keeps Book.timesRead equal to the number of COMPLETED reads.
import { PrismaClient, type Prisma } from "@prisma/client";
import { READ_STATUSES, readFromBook } from "../lib/readHistory.ts";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient();
const BATCH = 500;

async function main() {
  const books = await prisma.book.findMany({
    where: { status: { in: [...READ_STATUSES] } },
    select: { id: true, userId: true, status: true, startedAt: true, completedAt: true, stoppedAt: true, rating: true, currentPage: true, progressUnit: true, audioMinutes: true, currentMinute: true, timesRead: true, createdAt: true },
  });
  const withReads = new Set(
    (await prisma.bookRead.findMany({ distinct: ["bookId"], select: { bookId: true } })).map((r) => r.bookId)
  );
  const todo = books.filter((b) => !withReads.has(b.id));
  console.log(`${books.length} started book(s), ${todo.length} without reads${dryRun ? " (dry run, nothing is saved)" : ""}`);

  // Batches only split between books, so a run that fails part-way never leaves a book with some of
  // its reads (which a re-run would then skip).
  const batches: Prisma.BookReadCreateManyInput[][] = [[]];
  let total = 0;
  for (const book of todo) {
    const latest = readFromBook(book)!;
    // The latest read counts once if it's COMPLETED; any other completions happened before it.
    const earlier = Math.max(0, book.timesRead - (book.status === "COMPLETED" ? 1 : 0));
    // Explicit createdAt keeps the reads in order: undated earlier ones first, the latest last.
    const at = (i: number) => new Date(book.createdAt.getTime() + i);
    const rows: Prisma.BookReadCreateManyInput[] = [];
    for (let i = 0; i < earlier; i++) {
      rows.push({ bookId: book.id, userId: book.userId, status: "COMPLETED", createdAt: at(i) });
    }
    rows.push({ ...latest, createdAt: at(earlier) });
    if (batches[batches.length - 1].length >= BATCH) batches.push([]);
    batches[batches.length - 1].push(...rows);
    total += rows.length;
  }

  if (dryRun) {
    console.log(`would create ${total} read(s)`);
    return;
  }
  let created = 0;
  for (const data of batches) {
    if (!data.length) continue;
    const { count } = await prisma.bookRead.createMany({ data });
    created += count;
    console.log(`created ${created}/${total}`);
  }
  console.log(`done: ${created} read(s) for ${todo.length} book(s)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
