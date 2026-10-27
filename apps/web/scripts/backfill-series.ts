// Gives shelved books' catalogue works their series, from Hardcover (lib/seriesFill.ts), and files the
// other main books of each series so the tracker can show what's next. Adding a book does this for new
// copies; this catches the copies shelved before it did, and imports, which don't ask Hardcover per book.
//
//   pnpm backfill:series --dry-run          # the dev database (.env.local): count what's left, save nothing
//   pnpm backfill:series                    # fill them in
//   pnpm backfill:series:prod --dry-run     # production, from .env.prod.local
//   pnpm backfill:series:prod
//   pnpm backfill:series --all --limit=1500  # every catalogue book with a page, not only shelved ones
//   pnpm backfill:series --budget=2000      # stop before spending more than 2,000 Hardcover requests
//
// --all reaches the books nobody has shelved yet (an author's other books, ones filed from search), so
// their pages show a series too. Shelved works go first, then the rest. One work in a series files and
// tags the series' other books, so later ones in it cost nothing.
//
// Needs HARDCOVER_API_TOKEN. Up to four Hardcover requests per work (each top-level query field counts),
// paced under its 60-a-minute limit; its free plan allows 5,000 a day, shared with search and author
// pages, so a run stops at a request budget (--budget, 3,000 by default, leaving 2,000 of the day for
// search and author pages) and a large catalogue takes a run a day over several days.
// Safe to re-run: a work is only asked about once (Work.seriesCheckedAt), and a failed one is retried.
import { register } from "node:module";
import { PrismaClient } from "@prisma/client";

// lib/seriesFill.ts imports with "@/" and without file extensions; the test loader's hooks resolve them,
// so it's loaded after they're registered.
register("./test/alias-hooks.mjs", import.meta.url);

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const all = process.argv.includes("--all");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;
if (!(limit > 0)) throw new Error("--limit takes a positive number, as in --limit=1500");
const budgetArg = process.argv.find((a) => a.startsWith("--budget="));
const budget = budgetArg ? Number(budgetArg.slice("--budget=".length)) : 3000;
if (!(budget > 0) || budget > 5000) throw new Error("--budget takes a number of requests up to Hardcover's 5,000 a day, as in --budget=2000");
// Hardcover counts each top-level field of a query as a request: a lookup is three (two searches and the
// exact-title books) and a series' books one more, so four a work at most. A little over four seconds
// keeps under its 60 a minute.
const PACE_MS = 4100;
const THROTTLE_WAIT_MS = 65_000;
const MAX_THROTTLED = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { hardcoverConfigured } = await import("../lib/hardcover.ts");
  const { fillWorkSeries, SERIES_FILL_REQUESTS } = await import("../lib/seriesFill.ts");
  if (!hardcoverConfigured()) throw new Error("HARDCOVER_API_TOKEN is not set");
  const database = process.env.DATABASE_URL?.match(/@([^/?]+)\/([^?]*)/);
  console.log(`Database: ${database ? `${database[2] || "(default)"} on ${database[1]}` : "unknown"}`);

  // The most-shelved first.
  const copies = new Map<string, number>();
  for (const b of await prisma.book.findMany({ where: { workId: { not: null } }, select: { workId: true } })) {
    copies.set(b.workId!, (copies.get(b.workId!) ?? 0) + 1);
  }
  // Older rows don't have the field at all, which Mongo doesn't count as null.
  const unchecked = { OR: [{ seriesCheckedAt: null }, { seriesCheckedAt: { isSet: false } }] };
  const found = await prisma.work.findMany({
    // --all: books with a page (an Open Library or Hardcover work), never a hand-typed one, which may be
    // someone's private note (lib/workPages.ts).
    where: all
      ? { AND: [unchecked, { OR: [{ id: { in: Array.from(copies.keys()) } }, { openLibraryKey: { not: null } }, { hardcoverId: { not: null } }] }] }
      : { AND: [unchecked, { id: { in: Array.from(copies.keys()) } }] },
    select: { id: true, title: true, authors: true },
    orderBy: { id: "asc" },
  });
  const works = found.sort((a, b) => (copies.get(b.id) ?? 0) - (copies.get(a.id) ?? 0)).slice(0, limit);
  console.log(`${found.length} ${all ? "catalogue" : "shelved"} work(s) not yet checked for a series; doing ${works.length}${dryRun ? " (dry run, nothing is saved)" : ""}`);
  if (dryRun) return;

  const counts = { series: 0, none: 0, skipped: 0, failed: 0 };
  let throttled = 0;
  // Requests spent, counted at the most a work can cost when a call fails part way (or is refused).
  let spent = 0;
  for (let n = 0; n < works.length; n++) {
    const work = works[n];
    if (spent + SERIES_FILL_REQUESTS.series > budget) {
      console.log(`Stopping at the budget of ${budget} requests (${spent} spent); ${works.length - n} left for the next run.`);
      break;
    }
    try {
      const result = await fillWorkSeries(work.id);
      throttled = 0;
      spent += SERIES_FILL_REQUESTS[result];
      counts[result]++;
      if (result === "series") {
        const after = await prisma.work.findUnique({ where: { id: work.id }, select: { seriesName: true, seriesPosition: true } });
        console.log(`  ${work.title} (${work.authors[0]}): ${after?.seriesName}${after?.seriesPosition != null ? ` #${after.seriesPosition}` : ""}`);
      }
      // Already tagged by an earlier work in its series: nothing was asked, so no need to wait.
      if (result === "skipped") continue;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      spent += SERIES_FILL_REQUESTS.series;
      // Over the minute's allowance (other servers share the token): wait it out and try this work again.
      // Still refused after a few minutes means the day's allowance is gone; the rest stay unchecked for
      // the next run.
      if (message.includes("429")) {
        if (++throttled > MAX_THROTTLED) {
          console.warn(`Hardcover is still rate limiting (429). Stopping; re-run later to carry on from here.`);
          break;
        }
        console.warn(`  Hardcover is rate limiting (429); waiting a minute.`);
        await sleep(THROTTLE_WAIT_MS);
        n--;
        continue;
      }
      counts.failed++;
      console.warn(`  ${work.title}: failed, ${message}`);
    }
    if (n < works.length - 1) await sleep(PACE_MS);
  }
  console.log(`Done: ${counts.series} in a series, ${counts.none} standalone, ${counts.skipped} skipped, ${counts.failed} failed; about ${spent} Hardcover requests.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
