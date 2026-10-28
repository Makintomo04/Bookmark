import { requireUser } from "@/lib/apiAuth";
import { findUserByUsername } from "@/lib/userLookup";
import { handleOf } from "@/lib/handle";
import prisma from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { getRelation } from "@/lib/privacy";
import { notifyRequest, toggleFollow } from "@/lib/followRequests";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { NextResponse } from "next/server";

// Follows, unfollows, asks to follow or withdraws a request, depending on where the two stand. A profile
// that isn't public (Followers only or Private) approves each follower (lib/followRequests.ts).
export async function POST(
  req: Request,
  { params }: { params: { username: string } }
) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  // Follow and unfollow in a loop would otherwise fill someone's notifications.
  const limit = rateLimit(`follow:${currentUser.id}`, 60, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });

  const targetUser = await findUserByUsername(handleOf(params.username), { id: true, profileVisibility: true });
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (targetUser.id === currentUser.id) {
    return NextResponse.json({ error: "You can't follow yourself." }, { status: 400 });
  }

  // A block either way rules out following. Same answer as a missing user, so it isn't announced.
  // (Unfollowing someone you've blocked is already done: blocking removes the follow.)
  const { blocked } = await getRelation(currentUser.id, targetUser.id);
  if (blocked === "byOwner") {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (blocked === "byViewer") {
    return NextResponse.json({ error: "Unblock this reader to follow them." }, { status: 403 });
  }

  const result = await toggleFollow(currentUser.id, targetUser);
  if (result.request === "created") await notifyRequest(targetUser.id, currentUser.id);
  if (result.created) {
    // One unread "new follower" per reader, however often they unfollow and follow again.
    const unread = await prisma.notification.findFirst({
      where: { userId: targetUser.id, actorId: currentUser.id, type: "NEW_FOLLOWER", read: false },
      select: { id: true },
    });
    if (!unread) {
      await createNotification({ userId: targetUser.id, actorId: currentUser.id, type: "NEW_FOLLOWER" });
    }
  }
  return NextResponse.json({ isFollowing: result.isFollowing, requested: result.requested });
}
