import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { hasPageWhere } from "@/lib/workPages";
import { workDescription } from "@/lib/openLibrary";
import { normaliseBookKey, normaliseWorkKey } from "@/lib/workKey";

// Public, like search: it proxies Open Library, and Discover works signed out. A catalogue Work id (a
// book Open Library lacks) gets the catalogue's blurb, for works that have a book page.
export async function GET(req: Request) {
  const bookKey = normaliseBookKey(new URL(req.url).searchParams.get("workKey"));
  if (!bookKey) {
    return NextResponse.json({ error: "Invalid work key" }, { status: 400 });
  }
  const workKey = normaliseWorkKey(bookKey);
  if (!workKey) {
    const work = await prisma.work.findFirst({ where: { id: bookKey, ...hasPageWhere }, select: { description: true } });
    return NextResponse.json({ description: work?.description ?? null });
  }

  try {
    const description = await workDescription(workKey);
    return NextResponse.json({ description }, {
      headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
    });
  } catch {
    // A missing blurb shouldn't block adding the book.
    return NextResponse.json({ description: null });
  }
}
