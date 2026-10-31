import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { getReadingStats, wrappedYearsFor } from "@/lib/stats";
import { entitlementsOf } from "@/lib/entitlements";
import { cardToday } from "@bookmark/shared/wrapCards";

// The reader's own stats, as the /stats page shows them, for the mobile app. Every stat is free.
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const stats = await getReadingStats(user.id);
  // wrapDesigns: whether the Plus Wrap card designs are open to this reader. wrapToday: this year and month
  // in the profile's zone, which the Wrap card picker counts from, as the cards do.
  return NextResponse.json({ stats, wrappedYears: wrappedYearsFor(stats), accent: user.favColour ?? null, wrapDesigns: entitlementsOf(user).customWrapDesigns, wrapToday: cardToday(user.timeZone) });
}
