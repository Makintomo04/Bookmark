import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { GENRES } from "@/lib/genres";
import { findLists } from "@/lib/lists";

// The Discover home, as the /discover page builds it, for the mobile app: the spotlight list, the
// genres, team picks, readers' lists and lists people reported reading from. Picks from people you
// follow come from /api/lists/people-picks, as on the web.
export async function GET() {
  const viewer = await getCurrentUser();
  const [featured, picks, community, reported] = await Promise.all([
    findLists({ featured: true, limit: 1 }, viewer),
    findLists({ pick: true, limit: 12 }, viewer),
    findLists({ community: true, limit: 12 }, viewer),
    findLists({ reported: true, limit: 24 }, viewer),
  ]);
  return NextResponse.json({
    featured: featured[0] ?? null,
    genres: GENRES.map(({ slug, label }) => ({ slug, label })),
    picks,
    community,
    reported,
  });
}
