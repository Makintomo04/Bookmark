import getCurrentUser from "@/app/actions/getCurrentUser";
import { getProfileView } from "@/lib/publicProfile";
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
  return NextResponse.json({
    ...view.profile,
    // null when the whole profile is visible; otherwise why it isn't.
    restricted: view.access === "restricted" ? view.reason : null,
    isFollowing: relation.isFollower,
    isSelf: relation.isSelf,
    isBlocked: relation.blocked === "byViewer",
  });
}
