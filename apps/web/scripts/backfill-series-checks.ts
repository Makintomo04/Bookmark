// Records the series filled before new-book notifications existed (SeriesCheck, lib/seriesNews.ts), so the
// weekly re-check (lib/seriesRecheck.ts) knows what's already out. Only series someone follows or has
// started: the rest get a SeriesCheck when one of their books is next filled. Nobody is told anything here;
// the books already out are the furthest seen, and only books after them will count as new.
//
//   pnpm backfill:series-checks --dry-run        # the dev database (.env.local): count them, save nothing
//   pnpm backfill:series-checks
//   pnpm backfill:series-checks:prod --dry-run   # production, from .env.prod.local
//   pnpm backfill:series-checks:prod
//   pnpm backfill:series-checks --budget=2000    # stop before spending more than 2,000 Hardcover requests
//
// Needs HARDCOVER_API_TOKEN. Four Hardcover requests a series (the lookup is three, its books one), paced
// under its 60 a minute and stopped at a budget (3,000 by default) like scripts/backfill-series.ts. Safe to
// re-run: a series with a SeriesCheck is skipped.
import { register } from "node:module";
import { PrismaClient } from "@prisma/client";

// The lib files import with "@/" and without file extensions; the test loader's hooks resolve them.
register("./test/alias-hooks.mjs", import.meta.url);

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const budgetArg = process.argv.find((a) => a.startsWith("--budget="));
const budget = budgetArg ? Number(budgetArg.slice("--budget=".length)) : 3000;
if (!(budget > 0) || budget > 5000) throw new Error("--budget takes a number of requests up to Hardcover's 5,000 a day, as in --budget=2000");
const REQUESTS = 4;
const PACE_MS = 4100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { hardcoverConfigured, hardcoverSeriesBooks, hardcoverSeriesOf } = await import("../lib/hardcover.ts");
  const { seriesKey } = await import("../lib/series.ts");
  const { highestPosition } = await import("../lib/seriesNews.ts");
  if (!hardcoverConfigured()) throw new Error("HARDCOVER_API_TOKEN is not set");
  const database = process.env.DATABASE_URL?.match(/@([^/?]+)\/([^?]*)/);
  console.log(`Database: ${database ? `${database[2] || "(default)"} on ${database[1]}` : "unknown"}`);

  // Every catalogue work in a series, grouped by series.
  const works = await prisma.work.findMany({
    where: { seriesName: { not: null } },
    select: { id: true, title: true, authors: true, seriesName: true, seriesPosition: true },
  });
  const bySeries = new Map<string, { name: string, author: string, works: typeof works }>();
  for (const w of works) {
    if (!w.seriesName || !w.authors[0]) continue;
    const key = seriesKey(w.seriesName, w.authors[0]);
    const group = bySeries.get(key) ?? { name: w.seriesName, author: w.authors[0], works: [] };
    group.works.push(w);
    bySeries.set(key, group);
  }

  // The ones someone follows or has started, and not yet recorded.
  const wanted = new Set((await prisma.seriesFollow.findMany({ select: { seriesKey: true }, distinct: ["seriesKey"] })).map((f) => f.seriesKey));
  const keyOfWork = new Map(Array.from(bySeries.entries()).flatMap(([key, g]) => g.works.map((w) => [w.id, key] as const)));
  const read = await prisma.book.findMany({
    where: { workId: { in: Array.from(keyOfWork.keys()) }, OR: [{ status: { in: ["STARTED", "COMPLETED", "PAUSED"] } }, { timesRead: { gt: 0 } }] },
    select: { workId: true },
    distinct: ["workId"],
  });
  for (const b of read) if (b.workId && keyOfWork.has(b.workId)) wanted.add(keyOfWork.get(b.workId)!);
  const recorded = new Set((await prisma.seriesCheck.findMany({ select: { seriesKey: true } })).map((c) => c.seriesKey));
  const todo = Array.from(wanted).filter((key) => bySeries.has(key) && !recorded.has(key));
  console.log(`${todo.length} followed or started series not yet recorded${dryRun ? " (dry run, nothing is saved)" : ""}`);
  if (dryRun) return;

  let spent = 0;
  const counts = { recorded: 0, notFound: 0, failed: 0 };
  for (let n = 0; n < todo.length; n++) {
    if (spent + REQUESTS > budget) {
      console.log(`Stopping at the budget of ${budget} requests; ${todo.length - n} left for the next run.`);
      break;
    }
    const key = todo[n];
    const group = bySeries.get(key)!;
    // The earliest book is the one Hardcover is surest to place.
    const first = [...group.works].sort((a, b) => (a.seriesPosition ?? Infinity) - (b.seriesPosition ?? Infinity))[0];
    spent += REQUESTS;
    try {
      const found = await hardcoverSeriesOf(first.title, group.author);
      if (!found) {
        counts.notFound++;
        console.log(`  ${group.name}: not found on Hardcover`);
      } else {
        const books = await hardcoverSeriesBooks(found.id, group.author);
        const highest = highestPosition([...books.map((b) => b.position), ...group.works.map((w) => w.seriesPosition)]);
        await prisma.seriesCheck.upsert({
          where: { seriesKey: key },
          create: { seriesKey: key, name: group.name, author: group.author, hardcoverSeriesId: found.id, highestPosition: highest, checkedAt: new Date() },
          update: {},
        });
        counts.recorded++;
        console.log(`  ${group.name} (${group.author}): up to book ${highest ?? "?"}`);
      }
    } catch (err) {
      counts.failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ${group.name}: failed, ${message}`);
      if (message.includes("429")) {
        console.warn("Hardcover is rate limiting (429). Stopping; re-run later to carry on.");
        break;
      }
    }
    if (n < todo.length - 1) await sleep(PACE_MS);
  }
  console.log(`Done: ${counts.recorded} recorded, ${counts.notFound} not on Hardcover, ${counts.failed} failed; about ${spent} Hardcover requests.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
