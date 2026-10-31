import getCurrentUser from "@/app/actions/getCurrentUser";
import { handleOf } from "@/lib/handle";
import { getProfileView } from "@/lib/publicProfile";
import { filterOptions, pageShelf, parseShelfParams } from "@/lib/shelfFilter";
import { NextResponse } from "next/server";

//   GET /api/users/<username>/shelf?shelf=finished&take=60&cursor=60&sort=title&q=…&facets=1
// One page of someone's Finished or Want to read, as their profile may show it to this viewer: the phone's
// See all on another reader's profile, whose own payload carries only the newest of each (profilePreview).
// Searched, sorted and filtered by lib/shelfFilter.ts, as the reader's own paged /api/books is. Covers only,
// no review text: { books, total, nextCursor, options?, counts? }.
const SHOWN = { finished: "COMPLETED", want: "NOT_STARTED" } as const;

export async function GET(req: Request, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  const currentUser = await getCurrentUser();
  const view = await getProfileView(handleOf(params.username), currentUser?.id);
  if (!view || (view.access === "restricted" && view.reason === "unavailable")) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const search = new URL(req.url).searchParams;
  const filter = parseShelfParams(search);
  // A restricted profile shows no shelf, and a profile shows only these two (Reading now is on the profile itself).
  const shelf = filter.shelf === "finished" || filter.shelf === "want" ? filter.shelf : null;
  const books = view.access === "restricted" || !shelf ? [] : view.profile.books
    .filter((b) => b.status === SHOWN[shelf])
    .map(({ review, reviewSpoiler, reviewHidden, reviewRemoved, ...book }) => book);
  const page = pageShelf(books, { ...filter, shelf }, { take: Number(search.get("take")), cursor: search.get("cursor") });
  const all = view.access === "restricted" ? [] : view.profile.books;
  return NextResponse.json({
    ...page,
    ...(search.get("facets") === "1" && {
      options: filterOptions(books),
      counts: { finished: all.filter((b) => b.status === "COMPLETED").length, want: all.filter((b) => b.status === "NOT_STARTED").length },
    }),
  });
}
