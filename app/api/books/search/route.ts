import { NextResponse } from "next/server";
import { searchBooks } from "@/lib/openLibrary";

const SEARCH_UNAVAILABLE = "Couldn't reach the book catalogue. Try again in a moment.";

// Public: Discover's book search works signed out. It only proxies Open Library.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 3) {
    return NextResponse.json([]);
  }

  try {
    return NextResponse.json(await searchBooks(query, Number(searchParams.get("limit")) === 12 ? 12 : 6));
  } catch {
    // Not an empty list: the search boxes show "couldn't search, try again" rather than "no matches".
    return NextResponse.json({ error: SEARCH_UNAVAILABLE }, { status: 502 });
  }
}
