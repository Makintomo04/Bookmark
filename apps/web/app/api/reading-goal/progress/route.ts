import { requireUser } from "@/lib/apiAuth";
import { readingStreakState, resolveTimeZone } from "@/lib/achievements";
import { getGoalProgress } from "@/lib/stats";
import { NextResponse } from "next/server";

// The goal widget's progress for a year: finished reads, counted as /stats counts them, and the reader's
// own streak, so the card on their shelf says when it ends tonight (BOO-48).
export async function GET(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "") || new Date().getFullYear();

  const [progress, streak] = await Promise.all([
    getGoalProgress(currentUser.id, year),
    resolveTimeZone(currentUser.id, undefined).then((zone) => readingStreakState(currentUser.id, zone, 1000)),
  ]);
  return NextResponse.json({ ...progress, streak: { days: streak.streak, readToday: streak.readToday } });
}
