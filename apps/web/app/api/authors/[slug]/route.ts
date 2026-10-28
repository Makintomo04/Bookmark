import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { authorAbout, authorBooksPage, findAuthor, type Author } from "@/lib/authors";
import { canFollow, isFollowingAuthor } from "@/lib/authorFollows";
import { authorSeries } from "@/lib/seriesFollows";

// One author's page (/authors/<slug>): who they are, about them (on the first page) and a page of their books. The web page's
// "Show more" passes ?offset=, and the mobile app reads the first page. The first page also says whether the
// author can be followed, and whether the signed-in reader does, and the series of theirs in our catalog.
export async function GET(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const author = await findAuthor(decodeURIComponent(params.slug));
  if (!author) return NextResponse.json({ error: "Author not found" }, { status: 404 });
  const offset = Math.max(0, parseInt(new URL(req.url).searchParams.get("offset") || "0") || 0);
  const [books, about, follow] = await Promise.all([
    authorBooksPage(author, offset),
    offset === 0 ? authorAbout(author) : null,
    offset === 0 ? followState(author) : null,
  ]);
  return NextResponse.json({ author, ...(about && { about }), ...follow, ...books });
}

async function followState(author: Author) {
  const user = await getCurrentUser();
  const [isFollowing, series] = await Promise.all([
    user ? isFollowingAuthor(user.id, author.key) : false,
    authorSeries(author, user?.id ?? null),
  ]);
  return { canFollow: canFollow(author), isFollowing, series };
}
