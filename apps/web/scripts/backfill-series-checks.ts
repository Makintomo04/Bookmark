// Records the series someone follows or has started that have no SeriesCheck yet (lib/seriesNews.ts), so
// the weekly re-check (lib/seriesRecheck.ts) knows what's already out. The daily cron does this too, for
// series followed at any time and for books read in the last week; this covers the rest of history at
// once. Nobody is told anything: the books already out are the starting point, and only books after them
// count as new.
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
  const { hardcoverConfigured } = await import("../lib/hardcover.ts");
  const { recordExistingSeries, unrecordedSeries } = await import("../lib/seriesRecheck.ts");
  if (!hardcoverConfigured()) throw new Error("HARDCOVER_API_TOKEN is not set");
  const database = process.env.DATABASE_URL?.match(/@([^/?]+)\/([^?]*)/);
  console.log(`Database: ${database ? `${database[2] || "(default)"} on ${database[1]}` : "unknown"}`);

  const todo = await unrecordedSeries();
  console.log(`${todo.length} followed or started series not yet recorded${dryRun ? " (dry run, nothing is saved)" : ""}`);
  if (dryRun) return;

  let spent = 0;
  const counts = { recorded: 0, notOnHardcover: 0, failed: 0 };
  for (let n = 0; n < todo.length; n++) {
    if (spent + REQUESTS > budget) {
      console.log(`Stopping at the budget of ${budget} requests; ${todo.length - n} left for the next run.`);
      break;
    }
    const series = todo[n];
    spent += REQUESTS;
    try {
      const known = await recordExistingSeries(series);
      counts.recorded++;
      if (!known) counts.notOnHardcover++;
      console.log(`  ${series.name} (${series.author})${known ? "" : ": not on Hardcover, recorded from the catalogue"}`);
    } catch (err) {
      counts.failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ${series.name}: failed, ${message}`);
      if (message.includes("429")) {
        console.warn("Hardcover is rate limiting (429). Stopping; re-run later to carry on.");
        break;
      }
    }
    if (n < todo.length - 1) await sleep(PACE_MS);
  }
  console.log(`Done: ${counts.recorded} recorded (${counts.notOnHardcover} not on Hardcover), ${counts.failed} failed; about ${spent} Hardcover requests.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
