import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { hasPageWhere } from "@/lib/workPages";
import { workDescription } from "@/lib/openLibrary";
import { hardcoverRecord } from "@/lib/bookSearch";
import { normaliseBookKey, normaliseWorkKey } from "@/lib/workKey";

// Public, like search: it proxies Open Library (and Hardcover), and Discover works signed out. A
// catalogue Work id (a book Open Library lacks) gets the catalogue's blurb, for works that have a book
// page. Given the book's title and author, a work Open Library has no blurb for takes Hardcover's.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const bookKey = normaliseBookKey(params.get("workKey"));
  if (!bookKey) {
    return NextResponse.json({ error: "Invalid work key" }, { status: 400 });
  }
  const workKey = normaliseWorkKey(bookKey);
  if (!workKey) {
    const work = await prisma.work.findFirst({ where: { id: bookKey, ...hasPageWhere }, select: { description: true } });
    return NextResponse.json({ description: work?.description ?? null });
  }
  const title = params.get("title")?.slice(0, 300) ?? "";
  const author = params.get("author")?.slice(0, 200) ?? "";

  try {
    const description = await workDescription(workKey).catch(() => null)
      ?? (await hardcoverRecord(title, author))?.description
      ?? null;
    return NextResponse.json({ description }, {
      headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
    });
  } catch {
    // A missing blurb shouldn't block adding the book.
    return NextResponse.json({ description: null });
  }
}
