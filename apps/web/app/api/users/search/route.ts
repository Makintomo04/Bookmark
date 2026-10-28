import { booksReadCount } from "@/lib/readerTier";
import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { blockedUserIds, canView, privacyOf, privacySelect, searchableProfileWhere } from "@/lib/privacy";
import { staffBadgeOf, staffBadgeSelect } from "@/lib/staffBadge";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  // Private profiles never turn up, and a block in either direction hides the pair from each other.
  const blocked = await blockedUserIds(currentUser.id);
  const users = await prisma.user.findMany({
    where: {
      AND: [
        { OR: [{ username: { contains: query, mode: "insensitive" } }, { displayName: { contains: query, mode: "insensitive" } }] },
        { id: { notIn: [currentUser.id, ...blocked] } },
        searchableProfileWhere,
      ],
    },
    select: { id: true, username: true, displayName: true, image: true, favColour: true, bio: true, ...booksReadCount, ...privacySelect, ...staffBadgeSelect },
    take: 8,
  });

  const following = await prisma.follow.findMany({
    where: {
      followerId: currentUser.id,
      followingId: { in: users.map((u) => u.id) },
    },
    select: { followingId: true },
  });
  const followingIds = new Set(following.map((f) => f.followingId));

  // A followers-only reader shows up so they can be followed, but their bio and count stay with their followers.
  return NextResponse.json(
    users.map(({ id, username, displayName, image, favColour, bio, _count, role, isStaff, ...privacy }) => {
      const isFollowing = followingIds.has(id);
      const relation = { isSelf: false, isFollower: isFollowing, blocked: null };
      const open = canView(relation, privacyOf(privacy), "profile");
      // The seal shows for anyone who turns up, like their name; the role fields it comes from stay here.
      const staffBadge = staffBadgeOf({ role, isStaff, hideStaffBadge: privacy.hideStaffBadge });
      return { username, displayName, image, favColour, staffBadge, bio: open ? bio : null, ...(open ? { _count } : {}), isFollowing };
    })
  );
}
