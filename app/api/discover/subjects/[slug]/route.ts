import { NextResponse } from "next/server";
import { genreBySlug } from "@/lib/genres";
import { subjectBooks } from "@/lib/openLibrary";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const genre = genreBySlug(params.slug);
  if (!genre) {
    return NextResponse.json({ error: "Unknown genre" }, { status: 404 });
  }
  const offset = Math.max(0, parseInt(new URL(req.url).searchParams.get("offset") || "0") || 0);
  try {
    return NextResponse.json(await subjectBooks(genre.subject, offset));
  } catch {
    return NextResponse.json([]);
  }
}
