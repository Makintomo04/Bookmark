// Copies every hotlinked Open Library cover into UploadThing and points the book at the copy.
//
//   node --env-file=.env.local scripts/migrate-covers.ts --dry-run   # list, and check each cover downloads
//   node --env-file=.env.local scripts/migrate-covers.ts             # copy and update
//
// Safe to re-run: only books still on covers.openlibrary.org are picked up, and failures are left as they were.
import { PrismaClient } from "@prisma/client";
import { copyCoverToUploadThing, downloadCover } from "../lib/covers.ts";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

async function main() {
  const books = await prisma.book.findMany({
    where: { coverImage: { startsWith: "https://covers.openlibrary.org/" } },
    select: { id: true, title: true, coverImage: true },
  });
  console.log(`${books.length} book(s) with an Open Library cover${dryRun ? " (dry run, nothing is uploaded or saved)" : ""}`);

  // Several readers often add the same edition; copy each cover once.
  const copies = new Map<string, Promise<string>>();
  let updated = 0;
  let failed = 0;
  for (const book of books) {
    const source = book.coverImage;
    try {
      if (dryRun) {
        const file = await downloadCover(source);
        console.log(`would copy  ${book.id}  "${book.title}"  ${source}  (${file.size} bytes)`);
        continue;
      }
      if (!copies.has(source)) copies.set(source, copyCoverToUploadThing(source));
      const copy = await copies.get(source)!;
      // The where clause skips a book whose cover was changed while this ran.
      const { count } = await prisma.book.updateMany({
        where: { id: book.id, coverImage: source },
        data: { coverImage: copy },
      });
      if (count) updated++;
      console.log(`${count ? "copied" : "skipped (changed meanwhile)"}  ${book.id}  "${book.title}"  ${copy}`);
    } catch (err) {
      failed++;
      console.log(`failed  ${book.id}  "${book.title}"  ${source}  ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(dryRun ? `${books.length - failed} reachable, ${failed} failed` : `${updated} updated, ${failed} failed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
