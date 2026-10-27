import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { readerCountsForWork } from "@/lib/readerCounts";
import { normaliseBookKey } from "@/lib/workKey";

// Book details: how many readers are reading the book now and how many want to, with a few faces.
// Public, like the tags aggregate; signed in, it can show people the viewer follows and their own face.
// Under /api/books so a shelf change (refreshAfterBookChange) refreshes it.
//
//   GET /api/books/readers?workKey=OL45883W   (or a catalogue Work id, for a book Open Library lacks)
export async function GET(req: Request) {
  const workKey = normaliseBookKey(new URL(req.url).searchParams.get("workKey"));
  if (!workKey) return NextResponse.json({ error: "workKey is required" }, { status: 400 });

  const viewer = await getCurrentUser();
  return NextResponse.json(await readerCountsForWork(workKey, viewer?.id ?? null), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
