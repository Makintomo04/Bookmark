import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { seriesForWork } from "@/lib/seriesFollows";
import { normaliseBookKey } from "@/lib/workKey";

// Book details' "In this series": the book's series in order, marked with where the viewer has each book
// when signed in. Public, like the book page. Under /api/books so a shelf change (refreshAfterBookChange)
// refreshes it.
//
//   GET /api/books/series?workKey=OL82563W   (or a catalogue Work id, for a book Open Library lacks)
export async function GET(req: Request) {
  const workKey = normaliseBookKey(new URL(req.url).searchParams.get("workKey"));
  if (!workKey) return NextResponse.json({ error: "workKey is required" }, { status: 400 });

  const viewer = await getCurrentUser();
  return NextResponse.json({ series: await seriesForWork(workKey, viewer?.id ?? null) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
