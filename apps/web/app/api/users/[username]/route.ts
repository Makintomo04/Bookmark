import getCurrentUser from "@/app/actions/getCurrentUser";
import { getProfileView } from "@/lib/publicProfile";
import { hasRequested } from "@/lib/followRequests";
import { followsBack } from "@/lib/friends";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: { username: string } }
) {
  // Viewable by anyone, signed in or not, as far as the owner's privacy settings allow.
  // getProfileView applies them; this route only adds the viewer-specific flags.
  const currentUser = await getCurrentUser();
  const view = await getProfileView(params.username, currentUser?.id);

  if (!view || (view.access === "restricted" && view.reason === "unavailable")) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { relation } = view;
  // A follow request waiting on the owner, so the button can say "Requested" (the web page asks this itself).
  const requested = !!currentUser && !relation.isSelf && !relation.isFollower && (await hasRequested(currentUser.id, view.userId));
  // They follow the viewer: "Follow back", or "Friends" once the viewer follows them too (lib/friends.ts).
  const followsYou = !!currentUser && !relation.isSelf && (await followsBack(currentUser.id, view.userId));
  return NextResponse.json({
    ...view.profile,
    // null when the whole profile is visible; otherwise why it isn't.
    restricted: view.access === "restricted" ? view.reason : null,
    isFollowing: relation.isFollower,
    requested,
    followsYou,
    isSelf: relation.isSelf,
    isBlocked: relation.blocked === "byViewer",
  });
}
