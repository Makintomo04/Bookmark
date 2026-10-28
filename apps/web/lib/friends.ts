import prisma from "@/lib/db";
import { hasRequested } from "@/lib/followRequests";
import type { Relation } from "@/lib/privacyRules";
import { mutualFollowIds } from "@/lib/recommendations";
import { staffBadgeOf, staffBadgeSelect, type StaffBadgeKind } from "./staffBadge";

// Friends are readers who follow each other (packages/shared/src/followRules.ts areFriends): the same
// meaning as sending a book (lib/recommendations.ts) and the FRIENDS reading circle invite audience.
// Nothing is stored beyond the two Follow rows, so a block, which removes both, ends the friendship too.

// Does `ownerId` follow `viewerId`? The profile's "Follow back" and "Friends" states.
export async function followsBack(viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return false;
  const row = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: ownerId, followingId: viewerId } },
    select: { id: true },
  });
  return !!row;
}

// The follow button's flags for someone looking at a profile they can't see (RestrictedProfile): what
// every restricted page needs, in one place.
export async function restrictedViewerFlags(viewerId: string, ownerId: string, relation: Relation) {
  const [requested, followsYou] = await Promise.all([hasRequested(viewerId, ownerId), followsBack(viewerId, ownerId)]);
  return { isFollowing: relation.isFollower, requested, followsYou };
}

// Do the two follow each other? Two lookups rather than the whole list, for one pair.
export async function areFriends(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const [ab, ba] = await Promise.all([
    prisma.follow.findUnique({ where: { followerId_followingId: { followerId: a, followingId: b } }, select: { id: true } }),
    prisma.follow.findUnique({ where: { followerId_followingId: { followerId: b, followingId: a } }, select: { id: true } }),
  ]);
  return !!ab && !!ba;
}

export interface FriendPerson {
  username: string | null;
  image: string | null;
  favColour: string | null;
  staffBadge: StaffBadgeKind | null;
}

// Everyone the reader is friends with, by username: the reading circle invite picker. Readers either side
// has blocked are already left out (mutualFollowIds).
export async function friendsOf(userId: string): Promise<(FriendPerson & { id: string })[]> {
  const ids = await mutualFollowIds(userId);
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, image: true, favColour: true, ...staffBadgeSelect },
  });
  // The role fields become the staff seal and go no further.
  return users.map(({ role, isStaff, hideStaffBadge, ...u }) => ({ ...u, staffBadge: staffBadgeOf({ role, isStaff, hideStaffBadge }) })).sort((a, b) => (a.username ?? "").localeCompare(b.username ?? "", "en-GB", { sensitivity: "base" }));
}
