// Fills Work.matchKey (lib/catalog/normalise.ts workMatchKey) on works filed before it existed, so new
// books can be filed under them instead of a duplicate (lib/catalog/resolve.ts). Only sets the field on
// rows that don't have it; nothing else on a work changes, and no work is merged or removed.
//
//   node --env-file=.env.local scripts/backfill-work-match-keys.ts --dry-run    # count, save nothing
//   node --env-file=.env.local scripts/backfill-work-match-keys.ts              # fill them in
//   node scripts/with-test-db.mjs node scripts/backfill-work-match-keys.ts      # the test database
//
// Run `prisma db push` first so the matchKey index exists. Safe to re-run.
import { PrismaClient } from "@prisma/client";
import { workMatchKey } from "../lib/catalog/normalise.ts";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const BATCH = 500;

async function main() {
  let afterId: string | null = null;
  let seen = 0;
  let filled = 0;
  let blank = 0;
  for (;;) {
    const works: { id: string; title: string; authors: string[] }[] = await prisma.work.findMany({
      where: { OR: [{ matchKey: null }, { matchKey: { isSet: false } }], ...(afterId && { id: { gt: afterId } }) },
      select: { id: true, title: true, authors: true },
      orderBy: { id: "asc" },
      take: BATCH,
    });
    if (works.length === 0) break;
    afterId = works[works.length - 1].id;
    seen += works.length;
    for (const w of works) {
      const matchKey = workMatchKey(w.title, w.authors[0]);
      if (!matchKey) {
        blank++;
        continue;
      }
      if (!dryRun) await prisma.work.update({ where: { id: w.id }, data: { matchKey } });
      filled++;
    }
  }
  console.log(`${dryRun ? "Dry run: would fill" : "Filled"} ${filled} of ${seen} works without a match key${blank ? ` (${blank} have no usable title or author and stay blank)` : ""}.`);
}

main().finally(() => prisma.$disconnect());
