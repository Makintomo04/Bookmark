import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { booksToCsv, buildJsonExport, exportFilename, loadBooks } from "@/lib/export";

export const dynamic = "force-dynamic";

// GET /api/export?format=json|csv
// json: everything the reader owns, versioned. csv: books only, in Goodreads' column layout.
export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const format = new URL(req.url).searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "csv") {
    return NextResponse.json({ error: "format must be json or csv." }, { status: 400 });
  }

  // A full export reads every collection the reader has, so keep it to a handful an hour.
  const limit = rateLimit(`export:${user.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You've exported a lot in the last hour. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const headers = {
    "Content-Disposition": `attachment; filename="${exportFilename(user.username, format)}"`,
    "Cache-Control": "no-store",
  };

  if (format === "csv") {
    const books = await loadBooks(user.id);
    return new NextResponse(booksToCsv(books, user.favouriteIds), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    });
  }

  const data = await buildJsonExport(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
