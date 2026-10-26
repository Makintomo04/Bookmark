import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { seriesTracker } from "@/lib/seriesFollows";

// The signed-in reader's series tracker (the shelf, on web and in the app). Grouped on the client with
// trackerGroups from packages/shared/src/series.ts.
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  return NextResponse.json({ series: await seriesTracker(user.id) });
}
