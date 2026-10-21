import getCurrentUser from "@/app/actions/getCurrentUser";
import { getPublicProfile, isFollowing } from "@/lib/publicProfile";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: { username: string } }
) {
  // Public profile - viewable by anyone, logged in or not. currentUser is
  // only used to compute viewer-specific fields (isFollowing/isSelf) below.
  const [currentUser, data] = await Promise.all([getCurrentUser(), getPublicProfile(params.username)]);

  if (!data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const isSelf = currentUser ? data.userId === currentUser.id : false;

  return NextResponse.json({
    ...data.profile,
    isFollowing: currentUser && !isSelf ? await isFollowing(currentUser.id, data.userId) : false,
    isSelf,
  });
}
