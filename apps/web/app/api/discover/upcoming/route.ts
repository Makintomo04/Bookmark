import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { zoneOf } from "@/lib/jobs/common";
import { upcomingBooks } from "@/lib/upcoming";
import { localClock } from "@bookmark/shared/reminders";

// Upcoming (lib/upcoming.ts) for the app's Discover tab: books not out yet, soonest first, followed authors
// and series first when signed in. ?limit=, at most 120.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const viewer = await getCurrentUser();
  const limit = Math.min(120, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 24));
  const today = localClock(new Date(), zoneOf(viewer?.timeZone)).day;
  return NextResponse.json({ books: await upcomingBooks(viewer?.id ?? null, { today, limit }) });
}
