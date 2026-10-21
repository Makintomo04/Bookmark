import { NextResponse } from "next/server";
import { workDescription } from "@/lib/openLibrary";
import { normaliseWorkKey } from "@/lib/workKey";

// Public, like search: it only proxies Open Library, and Discover works signed out.
export async function GET(req: Request) {
  const workKey = normaliseWorkKey(new URL(req.url).searchParams.get("workKey"));
  if (!workKey) {
    return NextResponse.json({ error: "Invalid work key" }, { status: 400 });
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
