import { NextResponse } from "next/server";
import { genreBySlug } from "@/lib/genres";
import { trendingSubjectBooks } from "@/lib/openLibrary";
import { withCatalogueFixesOrAsIs } from "@/lib/curatedBooks";

export async function GET(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const genre = genreBySlug(params.slug);
  if (!genre) {
    return NextResponse.json({ error: "Unknown genre" }, { status: 404 });
  }
  const offset = Math.max(0, parseInt(new URL(req.url).searchParams.get("offset") || "0") || 0);
  try {
    return NextResponse.json(await withCatalogueFixesOrAsIs(await trendingSubjectBooks(genre.subject, offset)));
  } catch {
    return NextResponse.json([]);
  }
}
