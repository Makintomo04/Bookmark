import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { getReadingStats, wrappedYearsFor } from "@/lib/stats";

// The reader's own stats, as the /stats page shows them, for the mobile app. Every stat is free.
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const stats = await getReadingStats(user.id);
  return NextResponse.json({ stats, wrappedYears: wrappedYearsFor(stats), accent: user.favColour ?? null });
}
