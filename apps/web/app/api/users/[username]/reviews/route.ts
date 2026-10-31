import getCurrentUser from "@/app/actions/getCurrentUser";
import { handleOf } from "@/lib/handle";
import { getProfileView } from "@/lib/publicProfile";
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
  const view = await getProfileView(handleOf(params.username), currentUser?.id);
  if (!view || (view.access === "restricted" && view.reason === "unavailable")) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const search = new URL(req.url).searchParams;
  const take = Math.min(Math.max(parseInt(search.get("take") ?? "", 10) || 20, 1), SHELF_PAGE_MAX);
  const from = Math.max(parseInt(search.get("cursor") ?? "", 10) || 0, 0);
  const reviewed = view.access === "restricted" ? [] : reviewedBooks(view.profile.books);
  return NextResponse.json({
    books: reviewed.slice(from, from + take),
    total: reviewed.length,
    nextCursor: from + take < reviewed.length ? String(from + take) : null,
  });
}
