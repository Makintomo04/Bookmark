import getCurrentUser from "@/app/actions/getCurrentUser";
import { handleOf } from "@/lib/handle";
import { getProfileView, profilePreview } from "@/lib/publicProfile";
import { hasRequested } from "@/lib/followRequests";
import { followsBack } from "@/lib/friends";
import { shelfReviewCount } from "@/lib/reviewedBooks";
import { NextResponse } from "next/server";

export async function GET(req: Request, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  // Viewable by anyone, signed in or not, as far as the owner's privacy settings allow.
  // getProfileView applies them; this route only adds the viewer-specific flags.
  const currentUser = await getCurrentUser();
  const view = await getProfileView(handleOf(params.username), currentUser?.id);

  if (!view || (view.access === "restricted" && view.reason === "unavailable")) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const books = new URL(req.url).searchParams.get("books");
  // ?books=shelf is just their Finished and Want to read, as covers: no reviews. Their profile's page carries
  // the newest of each (profilePreview), and its shelves fetch the rest when the viewer searches or asks for all.
  if (books === "shelf") {
    if (view.access === "restricted") return NextResponse.json({ books: [] });
    return NextResponse.json({
      books: view.profile.books
        .filter((b) => b.status === "COMPLETED" || b.status === "NOT_STARTED")
        .map(({ review, reviewSpoiler, reviewHidden, reviewRemoved, ...book }) => book),
    });
  }
  const { relation } = view;
  // A follow request waiting on the owner, so the button can say "Requested" (the web page asks this itself).
  const requested = !!currentUser && !relation.isSelf && !relation.isFollower && (await hasRequested(currentUser.id, view.userId));
  // They follow the viewer: "Follow back", or "Friends" once the viewer follows them too (lib/friends.ts).
  const followsYou = !!currentUser && !relation.isSelf && (await followsBack(currentUser.id, view.userId));
  // ?books=0 leaves the shelf out, for the owner's header: their books come from /api/books already. It keeps
  // the review count, which the header shows before that loads.
  const withoutBooks = books === "0";
  // ?books=preview is their profile as its web page carries it (profilePreview): the newest of each shelf and
  // of their reviews, with booksRead, reviewCount and shelfCounts. The phone's profile screen asks for this.
  const preview = books === "preview" && view.access === "full";
  return NextResponse.json({
    ...(preview ? profilePreview(view.profile) : view.profile),
    ...(withoutBooks && "books" in view.profile && { books: undefined, reviewCount: shelfReviewCount(view.profile.books) }),
    // null when the whole profile is visible; otherwise why it isn't.
    restricted: view.access === "restricted" ? view.reason : null,
    isFollowing: relation.isFollower,
    requested,
    followsYou,
    isSelf: relation.isSelf,
    isBlocked: relation.blocked === "byViewer",
  });
}
