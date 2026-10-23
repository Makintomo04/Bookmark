// Files every shelf book under the shared catalog (Work and Edition in prisma/schema.prisma), setting
// Book.workId and Book.editionId. Nothing else on a book is touched: title, author, cover, pages,
// rating, review, dates and progress stay exactly as the reader has them.
//
//   node --env-file=.env.local scripts/backfill-catalog.ts --dry-run      # count and list, save nothing
//   node --env-file=.env.local scripts/backfill-catalog.ts                # link every unlinked book
//   node --env-file=.env.local scripts/backfill-catalog.ts --no-lookup    # no Open Library calls
//   node --env-file=.env.local scripts/backfill-catalog.ts --limit 500    # the first 500 only
//   node --env-file=.env.local scripts/backfill-catalog.ts --skip <id>,<id>   # leave these books unlinked
//   node --env-file=.env.local scripts/backfill-catalog.ts --unlink       # undo: clear both links
//
// Run `prisma db push` first so the collections and indexes exist. Safe to re-run: only books with no
// links are picked up, and Works and Editions are found by key, never duplicated. A book with a work
// key is filed under that Open Library work (one search request per 25 works, for title, authors, cover,
// year and subjects; the book's own description is used). A book without one is looked up by title and
// author (one request each) and, failing that, filed by title and author so it still has a Work; those
// are logged as "unmatched" and can be re-filed later. The edition is a best guess from the stored page
// count, shared with other readers whose copy has the same count.
//
// --unlink is the way back: it clears workId and editionId on every book and leaves the catalog rows
// in place (they hold no per-reader data), so the app behaves exactly as before the backfill.
import { PrismaClient, type Prisma } from "@prisma/client";
import { backfillCatalog } from "../lib/catalog/backfill.ts";
import { openLibraryLookup } from "../lib/catalog/lookup.ts";
import { scriptCatalogStore } from "./catalog-store.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const dryRun = flag("--dry-run");
const lookup = !flag("--no-lookup");
const limit = value("--limit") ? Number(value("--limit")) : undefined;
// Books to leave out of the catalogue entirely (junk test entries on readers' shelves): they stay unlinked,
// so a later run needs the same --skip.
const skip = (value("--skip") ?? "").split(",").map((id) => id.trim()).filter(Boolean);

const prisma = new PrismaClient();
const store = scriptCatalogStore(prisma);

// Books shelved before the catalog have no workId field at all, which Prisma on MongoDB doesn't count as
// null; books saved since without a match have an explicit null. Both are unlinked.
const UNLINKED: Prisma.BookWhereInput = {
  OR: [{ workId: null }, { workId: { isSet: false } }, { editionId: null }, { editionId: { isSet: false } }],
};

async function unlink() {
  const { count } = await prisma.book.updateMany({
    where: { OR: [{ workId: { not: null } }, { editionId: { not: null } }] },
    data: { workId: null, editionId: null },
  });
  console.log(`unlinked ${count} book(s); Work and Edition rows left in place`);
}

async function main() {
  if (flag("--unlink")) return unlink();

  const total = await prisma.book.count();
  const unlinked = await prisma.book.count({ where: UNLINKED });
  console.log(`${total} book(s), ${unlinked} not yet in the catalog${dryRun ? " (dry run, nothing is saved)" : ""}${lookup ? "" : " (no Open Library lookups)"}`);
  if (skip.length) console.log(`skipping ${skip.length} book(s): ${skip.join(", ")}`);

  // Readers' uploads stay out of the catalogue (lib/uploads.ts).
  const uploadKeys = new Set((await prisma.upload.findMany({ select: { key: true } })).map((u) => u.key));
  const summary = await backfillCatalog({
    store,
    uploadKeys,
    lookup: lookup ? openLibraryLookup : null,
    dryRun,
    limit,
    log: (line) => console.log(line),
    source: {
      async unlinked(afterId, take) {
        return prisma.book.findMany({
          where: { ...UNLINKED, id: { ...(afterId && { gt: afterId }), ...(skip.length && { notIn: skip }) } },
          orderBy: { id: "asc" },
          take,
          select: { id: true, title: true, author: true, pages: true, coverImage: true, description: true, workKey: true, workId: true, editionId: true },
        });
      },
      async link(bookId, ids) {
        await prisma.book.update({ where: { id: bookId }, data: ids });
      },
    },
  });

  console.log(
    `done: ${summary.seen} seen, ${summary.linked} linked, ${summary.matched} on Open Library, ` +
      `${summary.unmatched.length} filed by title and author, ${summary.failed.length} failed`,
  );
  for (const f of summary.failed) console.log(`failed: ${f.id} "${f.title}": ${f.error}`);
  if (summary.failed.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
