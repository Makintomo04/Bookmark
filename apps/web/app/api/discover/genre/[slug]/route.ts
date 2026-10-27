import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { genreBySlug } from "@/lib/genres";
import { findLists } from "@/lib/lists";
import { trendingSubjectBooks } from "@/lib/openLibrary";
import { withCatalogueFixesOrAsIs } from "@/lib/curatedBooks";

// One genre's page (/discover/genre/<slug>) for the mobile app: team picks then readers' lists, and
// what's trending in the genre on Open Library.
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const genre = genreBySlug(params.slug);
  if (!genre) return NextResponse.json({ error: "Genre not found" }, { status: 404 });
  const viewer = await getCurrentUser();
  const [picks, community, books] = await Promise.all([
    findLists({ pick: true, genre: genre.slug, limit: 8 }, viewer),
    findLists({ community: true, genre: genre.slug, limit: 8 }, viewer),
    trendingSubjectBooks(genre.subject).catch(() => []).then(withCatalogueFixesOrAsIs),
  ]);
  return NextResponse.json({ genre: { slug: genre.slug, label: genre.label }, lists: [...picks, ...community], books });
}
