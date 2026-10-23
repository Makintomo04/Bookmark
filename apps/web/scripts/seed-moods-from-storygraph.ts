// Seeds a reader's moods from the "Moods" column of their StoryGraph export, onto the Works their shelf
// books are filed under. Reads the file with the same parser the import uses (lib/import) and never
// changes it; a book the import filed by title and author is matched the same way here.
//
//   node --env-file=.env.local scripts/seed-moods-from-storygraph.ts --user=<username or email> <export.csv> [--dry-run]
//
// Safe to re-run: a reader who has already tagged a book keeps their tags. Books not yet linked to a
// catalog Work (scripts/backfill-catalog.ts hasn't run for them) are listed and skipped.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseCsvRecords } from "../lib/import/csv.ts";
import { parseImport } from "../lib/import/formats.ts";
import { sameBook } from "../lib/workKey.ts";
import { moodsFromStoryGraph } from "../lib/workTags.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const who = args.find((a) => a.startsWith("--user="))?.slice("--user=".length);
const file = args.find((a) => !a.startsWith("--"));
if (!who || !file) {
  console.error("Usage: node --env-file=.env.local scripts/seed-moods-from-storygraph.ts --user=<username or email> <export.csv> [--dry-run]");
  process.exit(2);
}

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { OR: [{ username: who }, { email: who }] }, select: { id: true, username: true } });
  if (!user) throw new Error(`No reader called ${who}`);

  const text = readFileSync(file!, "utf8");
  const parsed = parseImport(text);
  if (parsed.source !== "storygraph") throw new Error(`That file looks like a ${parsed.source} export; only StoryGraph has a Moods column.`);
  // The import's rows carry their 1-based data line; the raw records are in file order, so line - 1 is the record.
  const { records } = parseCsvRecords(text);

  const shelf = await prisma.book.findMany({ where: { userId: user.id }, select: { id: true, title: true, author: true, workKey: true, workId: true } });
  const existing = new Set((await prisma.readerTags.findMany({ where: { userId: user.id }, select: { workId: true } })).map((t) => t.workId));

  let seeded = 0, kept = 0, unlinked = 0, unmatched = 0, empty = 0;
  for (const row of parsed.rows) {
    const moods = moodsFromStoryGraph(records[row.line - 1]?.["Moods"]);
    if (moods.length === 0) { empty++; continue; }
    const book = shelf.find((b) => sameBook(b, row));
    if (!book) { unmatched++; console.log(`  not on shelf: ${row.title}`); continue; }
    if (!book.workId) { unlinked++; console.log(`  not in the catalog yet (run the backfill): ${row.title}`); continue; }
    if (existing.has(book.workId)) { kept++; continue; }
    console.log(`  ${row.title}: ${moods.map((m) => m.toLowerCase()).join(", ")}`);
    if (!dryRun) {
      await prisma.readerTags.create({ data: { workId: book.workId, userId: user.id, moods, warnings: [] } });
      existing.add(book.workId);
    }
    seeded++;
  }
  console.log(`${dryRun ? "Would seed" : "Seeded"} ${seeded} for ${user.username}; ${kept} already tagged, ${unlinked} not in the catalog, ${unmatched} not on the shelf, ${empty} without moods.`);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
