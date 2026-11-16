import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/cronAuth";
import { runCheckpointReminders } from "@/lib/jobs/checkpointReminders";
import { runHeldPushes } from "@/lib/jobs/heldPushes";
import { clearOldSends } from "@/lib/jobs/ledger";
import { runPublicationDay } from "@/lib/jobs/publicationDay";
import { runReadingNudges } from "@/lib/jobs/readingNudges";
import { runWeeklyDigest } from "@/lib/jobs/weeklyDigest";
import { runClubVotes } from "@/lib/clubVotesServer";

// Every 15 minutes (vercel.json): the scheduled sends that bring readers back (BOO-48), and publication-day
// alerts (BOO-8), each due at a time in the reader's own zone, so every tick looks for who is due now. Jobs
// run one after another, each stopping at a share of the run's time; what's left is still due next tick.
// Called by Vercel Cron with CRON_SECRET as a bearer token, or by hand with the same header on a preview.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Seconds each job may run for, in order, out of maxDuration with room to spare.
const BUDGET_S = { nudges: 75, checkpoints: 45, publicationDays: 35, heldPushes: 20, clubVotes: 10, digest: 85 };

export async function GET(req: Request) {
  if (!isCronAuthorised(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const now = new Date();
  const until = (seconds: number) => ({ now, deadline: Date.now() + seconds * 1000 });
  const result = {
    ...(await runReadingNudges(until(BUDGET_S.nudges))),
    ...(await runCheckpointReminders(until(BUDGET_S.checkpoints))),
    ...(await runPublicationDay(until(BUDGET_S.publicationDays))),
    // Book news found during readers' quiet hours, pushed now they've ended (lib/notifications.ts).
    ...(await runHeldPushes(until(BUDGET_S.heldPushes))),
    // Club votes whose time is up close and announce their winner, even if nobody opens the club.
    ...(await runClubVotes(until(BUDGET_S.clubVotes))),
    ...(await runWeeklyDigest(until(BUDGET_S.digest))),
    cleared: await clearOldSends(now),
  };
  console.log("[cron/tick]", JSON.stringify(result));
  return NextResponse.json(result);
}
