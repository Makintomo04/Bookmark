import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { blockedUserIds } from "@/lib/privacy";
import { needsFollowApproval } from "@/lib/followRules";

export { needsFollowApproval };

// Follow requests (FollowRequest in prisma/schema.prisma). A reader whose profile is Followers only or
// Private approves each new follower; a public profile is followed straight away, as before.

// What the follow button does for `viewerId` on `target`: unfollow, withdraw a pending request, follow, or
// ask. Toggles, like the button. Blocks are checked by the caller.
export async function toggleFollow(viewerId: string, target: { id: string; profileVisibility?: Parameters<typeof needsFollowApproval>[0]["profileVisibility"] }) {
  const pair = { followerId: viewerId, followingId: target.id };
  const existing = await prisma.follow.findUnique({ where: { followerId_followingId: pair }, select: { id: true } });
  if (existing) {
    await prisma.follow.deleteMany({ where: { id: existing.id } });
    return { isFollowing: false, requested: false, created: false, request: null };
  }

  const request = await prisma.followRequest.findUnique({ where: { requesterId_targetId: { requesterId: viewerId, targetId: target.id } }, select: { id: true } });
  if (request) {
    await prisma.followRequest.deleteMany({ where: { id: request.id } });
    await clearRequestNotification(target.id, viewerId);
    return { isFollowing: false, requested: false, created: false, request: "withdrawn" as const };
  }

  if (needsFollowApproval(target)) {
    try {
      await prisma.followRequest.create({ data: { requesterId: viewerId, targetId: target.id } });
    } catch (err) {
      // A double click: the first request stands, and so does its notification.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { isFollowing: false, requested: true, created: false, request: null };
      throw err;
    }
    return { isFollowing: false, requested: true, created: false, request: "created" as const };
  }

  try {
    await prisma.follow.create({ data: pair });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { isFollowing: true, requested: false, created: false, request: null };
    throw err;
  }
  return { isFollowing: true, requested: false, created: true, request: null };
}

// The owner's FOLLOW_REQUEST notification for one requester: one at a time, however often they ask and
// withdraw, and gone once the request is answered or withdrawn so the bell never offers a stale Accept.
export async function notifyRequest(targetId: string, requesterId: string) {
  await clearRequestNotification(targetId, requesterId);
  await prisma.notification.create({ data: { userId: targetId, actorId: requesterId, type: "FOLLOW_REQUEST" } });
}

export async function clearRequestNotification(targetId: string, requesterId: string) {
  await prisma.notification.deleteMany({ where: { userId: targetId, actorId: requesterId, type: "FOLLOW_REQUEST" } });
}

export async function hasRequested(viewerId: string, targetId: string) {
  return !!(await prisma.followRequest.findUnique({ where: { requesterId_targetId: { requesterId: viewerId, targetId } }, select: { id: true } }));
}

export interface PendingFollowRequest {
  id: string;
  createdAt: string;
  requester: { username: string | null; image: string | null; favColour: string | null };
}

// The owner's pending requests, newest first. Requests from readers either side has since blocked are
// left out (and can't be accepted).
export async function pendingRequestsFor(ownerId: string, take = 50): Promise<PendingFollowRequest[]> {
  const [requests, blocked] = await Promise.all([
    prisma.followRequest.findMany({ where: { targetId: ownerId }, orderBy: { createdAt: "desc" }, take }),
    blockedUserIds(ownerId),
  ]);
  const visible = requests.filter((r) => !blocked.includes(r.requesterId));
  const users = await prisma.user.findMany({
    where: { id: { in: visible.map((r) => r.requesterId) } },
    select: { id: true, username: true, image: true, favColour: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return visible.flatMap((r) => {
    const user = byId.get(r.requesterId);
    // A requester whose account is gone.
    if (!user) return [];
    return [{ id: r.id, createdAt: r.createdAt.toISOString(), requester: { username: user.username, image: user.image, favColour: user.favColour } }];
  });
}

export async function pendingRequestCount(ownerId: string) {
  return prisma.followRequest.count({ where: { targetId: ownerId } });
}

export type RequestResponse = { ok: true; accepted: boolean } | { ok: false; status: number; error: string };

// Accept or decline one of the owner's requests. Accepting makes the follow; the requester sees
// "Following" the next time they look. Declining is silent.
export async function respondToRequest(ownerId: string, requestId: string, accept: boolean): Promise<RequestResponse> {
  if (!/^[0-9a-f]{24}$/i.test(requestId)) return { ok: false, status: 404, error: "Request not found" };
  const request = await prisma.followRequest.findUnique({ where: { id: requestId } });
  if (!request || request.targetId !== ownerId) return { ok: false, status: 404, error: "Request not found" };

  // Claimed by deleting it, so a double click can't make two follows.
  const { count } = await prisma.followRequest.deleteMany({ where: { id: request.id } });
  if (count > 0) await clearRequestNotification(ownerId, request.requesterId);
  if (count === 0 || !accept) return { ok: true, accepted: false };

  const blocked = await blockedUserIds(ownerId);
  if (blocked.includes(request.requesterId)) return { ok: true, accepted: false };
  const requester = await prisma.user.findUnique({ where: { id: request.requesterId }, select: { id: true } });
  if (!requester) return { ok: true, accepted: false };

  try {
    await prisma.follow.create({ data: { followerId: request.requesterId, followingId: ownerId } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
  return { ok: true, accepted: true };
}

// The same, from the bell, which knows the requester rather than the request.
export async function respondToRequestFrom(ownerId: string, requesterUsername: string, accept: boolean): Promise<RequestResponse> {
  const requester = await prisma.user.findUnique({ where: { username: requesterUsername }, select: { id: true } });
  const request = requester && await prisma.followRequest.findUnique({ where: { requesterId_targetId: { requesterId: requester.id, targetId: ownerId } }, select: { id: true } });
  if (!request) {
    // Already answered (here or in another tab) or withdrawn: tidy the bell and say so.
    if (requester) await clearRequestNotification(ownerId, requester.id);
    return { ok: false, status: 404, error: "That request has already been answered or withdrawn." };
  }
  return respondToRequest(ownerId, request.id, accept);
}

// The owner removes someone from their followers (including those who followed before approval existed).
export async function removeFollower(ownerId: string, followerId: string) {
  const { count } = await prisma.follow.deleteMany({ where: { followerId, followingId: ownerId } });
  return count > 0;
}
