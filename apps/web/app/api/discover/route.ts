import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { GENRES } from "@/lib/genres";
import { findLists, followingPicks } from "@/lib/lists";

// The Discover home, as the /discover page builds it, for the mobile app: the spotlight list, the
// genres, what people you follow recently listed or loved, team picks, readers' lists and lists people
// reported reading from.
export async function GET() {
  const viewer = await getCurrentUser();
  const [featured, picks, community, reported, following] = await Promise.all([
    findLists({ featured: true, limit: 1 }, viewer),
    findLists({ pick: true, limit: 12 }, viewer),
    findLists({ community: true, limit: 12 }, viewer),
    findLists({ reported: true, limit: 24 }, viewer),
    viewer ? followingPicks(viewer.id) : Promise.resolve({ followsAnyone: false, picks: [] }),
  ]);
  return NextResponse.json({
    featured: featured[0] ?? null,
    genres: GENRES.map(({ slug, label }) => ({ slug, label })),
    following,
    picks,
    community,
    reported,
  });
}
