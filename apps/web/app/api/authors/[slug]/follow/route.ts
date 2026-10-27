import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { findAuthor } from "@/lib/authors";
import { canFollow, setFollowingAuthor } from "@/lib/authorFollows";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";

// Follow (PUT) or unfollow (DELETE) an author. Free, and the same on web and in the app. The author is
// looked up here rather than trusted from the client, so the key always matches the page.
async function setFollowing(slug: string, following: boolean) {
  const { user, response } = await requireUser("Sign in to follow authors.");
  if (response) return response;
  const limit = rateLimit(`author-follow:${user.id}`, 120, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });

  const author = await findAuthor(decodeURIComponent(slug));
  if (!author) return NextResponse.json({ error: "Author not found" }, { status: 404 });
  if (!canFollow(author)) return NextResponse.json({ error: "This author can't be followed yet." }, { status: 409 });

  await setFollowingAuthor(user.id, author, following);
  return NextResponse.json({ isFollowing: following });
}

export async function PUT(_req: Request, { params }: { params: { slug: string } }) {
  return setFollowing(params.slug, true);
}

export async function DELETE(_req: Request, { params }: { params: { slug: string } }) {
  return setFollowing(params.slug, false);
}
