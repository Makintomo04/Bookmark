// Records the series someone follows or has started that have no SeriesCheck yet (lib/seriesNews.ts), so
// the weekly re-check (lib/seriesRecheck.ts) knows what's already out. The hourly cron does this too, for
// the last day's follows and reading; this covers the rest of history at once. Nobody is told anything:
// the books already out are the starting point, and only books after them count as new.
//
//   pnpm backfill:series-checks --dry-run        # the dev database (.env.local): count them, save nothing
//   pnpm backfill:series-checks
//   pnpm backfill:series-checks:prod --dry-run   # production, from .env.prod.local
//   pnpm backfill:series-checks:prod
//
// No Hardcover requests: each series is recorded from the catalogue's books and due at once, and the cron
// looks it up on Hardcover within its own allowance (about 15 a run). Safe to re-run: a series with a
// SeriesCheck is skipped.
import { register } from "node:module";
import { PrismaClient } from "@prisma/client";

// The lib files import with "@/" and without file extensions; the test loader's hooks resolve them.
register("./test/alias-hooks.mjs", import.meta.url);

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const { queueSeries, unrecordedSeries } = await import("../lib/seriesRecheck.ts");
  const database = process.env.DATABASE_URL?.match(/@([^/?]+)\/([^?]*)/);
  console.log(`Database: ${database ? `${database[2] || "(default)"} on ${database[1]}` : "unknown"}`);

  const todo = await unrecordedSeries();
  console.log(`${todo.length} followed or started series not yet recorded${dryRun ? " (dry run, nothing is saved)" : ""}`);
  if (dryRun) return;
  const queued = await queueSeries(todo);
  console.log(`Done: ${queued} recorded. The cron looks them up on Hardcover over the next ${Math.max(1, Math.ceil(queued / 15))} hour(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
