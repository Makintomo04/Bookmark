import { NextResponse } from "next/server";
import { searchCatalogue, searchShelves } from "@/lib/bookSearch";
import { mergeResults } from "@/lib/bookSearchRules";

const SEARCH_UNAVAILABLE = "Couldn't reach the book catalogue. Try again in a moment.";

// Public: Discover's book search works signed out. Returns books from readers' shelves merged with Open
// Library's results. `source=shelves` returns just the shelf matches, which come back in milliseconds, so
// search boxes can show them while Open Library is still answering.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 3) {
    return NextResponse.json([]);
  }
  const limit = Number(searchParams.get("limit")) === 12 ? 12 : 6;

  const shelves = searchShelves(query, limit).catch(() => [] as Awaited<ReturnType<typeof searchShelves>>);
  if (searchParams.get("source") === "shelves") {
    return NextResponse.json(await shelves);
  }

  try {
    const [local, remote] = await Promise.all([shelves, searchCatalogue(query, limit)]);
    return NextResponse.json(mergeResults(local, remote, limit));
  } catch {
    // Open Library is down: shelf matches are still worth showing.
    const local = await shelves;
    if (local.length > 0) return NextResponse.json(local);
    // Not an empty list: the search boxes show "couldn't search, try again" rather than "no matches".
    return NextResponse.json({ error: SEARCH_UNAVAILABLE }, { status: 502 });
  }
}
