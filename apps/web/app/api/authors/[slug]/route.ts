import { NextResponse } from "next/server";
import { authorAbout, authorBooksPage, findAuthor } from "@/lib/authors";

// One author's page (/authors/<slug>): who they are, about them (on the first page) and a page of their books. The web page's
// "Show more" passes ?offset=, and the mobile app reads the first page.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const author = await findAuthor(decodeURIComponent(params.slug));
  if (!author) return NextResponse.json({ error: "Author not found" }, { status: 404 });
  const offset = Math.max(0, parseInt(new URL(req.url).searchParams.get("offset") || "0") || 0);
  const [books, about] = await Promise.all([authorBooksPage(author, offset), offset === 0 ? authorAbout(author) : null]);
  return NextResponse.json({ author, ...(about && { about }), ...books });
}
