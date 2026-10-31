import getCurrentUser from "@/app/actions/getCurrentUser";
import { handleOf } from "@/lib/handle";
import { getProfileShelf } from "@/lib/publicProfile";
import { reviewedBooks } from "@/lib/reviewedBooks";
import { SHELF_PAGE_MAX } from "@/lib/shelfFilter";
import { NextResponse } from "next/server";

//   GET /api/users/<username>/reviews?take=20&cursor=20
// Someone's reviews a page at a time, newest finish first, as their profile may show them to this viewer
// (the web's /u/<username>/reviews lists the same): the phone's See all, past the five its profile carries.
// { books, total, nextCursor }, each book with its review.
export async function GET(req: Request, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  const currentUser = await getCurrentUser();
  const search = new URL(req.url).searchParams;
  const take = Math.min(Math.max(parseInt(search.get("take") ?? "", 10) || 20, 1), SHELF_PAGE_MAX);
  const from = Math.max(parseInt(search.get("cursor") ?? "", 10) || 0, 0);
  // Only the books with a review, and the text of this page's (lib/publicProfile.ts getProfileShelf).
  const view = await getProfileShelf(handleOf(params.username), currentUser?.id, "reviews", { from, take });
  if (!view || (view.access === "restricted" && view.unavailable)) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (view.access === "restricted") return NextResponse.json({ books: [], total: 0, nextCursor: null });
  const total = view.total ?? 0;
  return NextResponse.json({
    // In order already; a review of only spaces has no text to show, so it drops out here.
    books: reviewedBooks(view.books.map((b) => ({ ...b, review: b.review ?? null }))),
    total,
    nextCursor: from + take < total ? String(from + take) : null,
  });
}
