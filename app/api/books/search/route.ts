import { NextResponse } from "next/server";
import { searchBooks } from "@/lib/openLibrary";

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
    // External API hiccup shouldn't break the add-book flow - just return no results.
    return NextResponse.json([]);
  }
}
