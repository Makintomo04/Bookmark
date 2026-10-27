import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { reviewsForWork } from "@/lib/workReviews";
import { normaliseBookKey } from "@/lib/workKey";

// A book page's reviews, a page at a time: the viewer's own first, then people they follow, then
// everyone else. Public, like the page; signed out, only reviews their writers show to everyone.
// Under /api/books so saving a review (refreshAfterBookChange) refreshes it.
//
//   GET /api/books/reviews?workKey=OL45883W&offset=10   (or a catalogue Work id)
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const workKey = normaliseBookKey(params.get("workKey"));
  if (!workKey) return NextResponse.json({ error: "workKey is required" }, { status: 400 });
  const offset = Math.max(0, Number(params.get("offset")) || 0);

  const viewer = await getCurrentUser();
  return NextResponse.json(await reviewsForWork(workKey, viewer?.id ?? null, offset), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
