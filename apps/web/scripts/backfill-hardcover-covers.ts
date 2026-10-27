// Gives shelved books with no cover Hardcover's, when Hardcover has the same book (title and first
// author, lib/hardcover.ts findOnHardcover). These are copies added while Open Library had a record but no
// cover for it (Kate Posey's Serial Killer Games, for one); search fills that gap for new adds now. A copy
// with no blurb takes Hardcover's too, and the catalogue Work takes both where it has neither. Nothing that
// already has a cover or blurb changes.
//
//   node --env-file=.env.local scripts/backfill-hardcover-covers.ts --dry-run    # list, save nothing
//   node --env-file=.env.local scripts/backfill-hardcover-covers.ts              # fill them in
//   node scripts/with-test-db.mjs node scripts/backfill-hardcover-covers.ts      # the test database
//
// Needs HARDCOVER_API_TOKEN. One Hardcover search per distinct book, paced under its 60-a-minute limit.
// Safe to re-run: only copies still without a cover are picked up.
import { register } from "node:module";
import { PrismaClient } from "@prisma/client";

// lib/hardcover.ts imports without file extensions; the test loader's hooks resolve them.
register("./test/alias-hooks.mjs", import.meta.url);
const { findOnHardcover, hardcoverConfigured } = await import("../lib/hardcover.ts");

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const PACE_MS = 1100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const keyOf = (b: { title: string; author: string }) => `${b.title.trim().toLowerCase()}|${b.author.trim().toLowerCase()}`;

async function main() {
  if (!hardcoverConfigured()) throw new Error("HARDCOVER_API_TOKEN is not set");
  const books = await prisma.book.findMany({
    where: { coverImage: "" },
    select: { id: true, title: true, author: true, description: true, workId: true },
  });
  const byBook = new Map<string, typeof books>();
  for (const b of books) {
    if (!b.title.trim() || !b.author.trim() || b.author === "Unknown") continue;
    const group = byBook.get(keyOf(b));
    if (group) group.push(b);
    else byBook.set(keyOf(b), [b]);
  }
  console.log(`${books.length} cover-less cop${books.length === 1 ? "y" : "ies"}, ${byBook.size} distinct book(s) to look up${dryRun ? " (dry run, nothing is saved)" : ""}`);

  let filled = 0;
  let missing = 0;
  let failed = 0;
  for (const copies of byBook.values()) {
    const { title, author } = copies[0];
    let found: Awaited<ReturnType<typeof findOnHardcover>> = null;
    try {
      found = await findOnHardcover(title, author);
    } catch (err) {
      failed++;
      console.warn(`  ! ${title} by ${author}: ${err instanceof Error ? err.message : err}`);
      await sleep(PACE_MS);
      continue;
    }
    await sleep(PACE_MS);
    if (!found?.coverUrl) {
      missing++;
      continue;
    }
    console.log(`  ${title} by ${author}: ${copies.length} cop${copies.length === 1 ? "y" : "ies"} -> ${found.coverUrl}`);
    filled += copies.length;
    if (dryRun) continue;
    for (const copy of copies) {
      // Only if the copy is still cover-less: the reader may have set one meanwhile.
      await prisma.book.updateMany({
        where: { id: copy.id, coverImage: "" },
        data: { coverImage: found.coverUrl, ...(!copy.description && found.description && { description: found.description }) },
      });
    }
    const workIds = Array.from(new Set(copies.flatMap((c) => (c.workId ? [c.workId] : []))));
    if (workIds.length) {
      await prisma.work.updateMany({ where: { id: { in: workIds }, coverUrl: null }, data: { coverUrl: found.coverUrl } });
      if (found.description) {
        await prisma.work.updateMany({ where: { id: { in: workIds }, description: null }, data: { description: found.description } });
      }
    }
  }
  console.log(`${dryRun ? "Dry run: would fill" : "Filled"} ${filled} cop${filled === 1 ? "y" : "ies"}; ${missing} book(s) not on Hardcover or without a cover there${failed ? `; ${failed} lookup(s) failed and were left as they were` : ""}.`);
}

main().finally(() => prisma.$disconnect());
