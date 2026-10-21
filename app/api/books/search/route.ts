import getCurrentUser from "@/app/actions/getCurrentUser";
import { NextResponse } from "next/server";

interface OpenLibraryDoc {
  title: string;
  author_name?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
}

export async function GET(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.error();
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 3) {
    return NextResponse.json([]);
  }

  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=title,author_name,cover_i,number_of_pages_median&limit=6`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return NextResponse.json([]);
    }
    const data = await res.json();
    const docs: OpenLibraryDoc[] = data.docs || [];
    const results = docs
      .filter((doc) => doc.title)
      .map((doc) => ({
        title: doc.title,
        author: doc.author_name?.[0] || "Unknown",
        pages: doc.number_of_pages_median || null,
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
      }));
    return NextResponse.json(results);
  } catch {
    // External API hiccup shouldn't break the add-book flow - just return no results.
    return NextResponse.json([]);
  }
}
