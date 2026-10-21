import { booksReadCount } from "@/lib/readerTier";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export type FollowListKind = "followers" | "following";

export interface FollowListUser {
  username: string;
  image: string | null;
  favColour: string | null;
  bio: string | null;
  isFollowing: boolean;
  isSelf: boolean;
  _count?: { books?: number };
}

export const FOLLOW_PAGE_SIZE = 30;

const userSelect = { id: true, username: true, image: true, favColour: true, bio: true, ...booksReadCount };

// Public, like the profile it belongs to. The viewer only changes the isFollowing/isSelf flags.
// Pages are newest-first and keyed by the Follow row id so a follow landing mid-scroll doesn't shift pages.
export async function getFollowList(req: Request, username: string, kind: FollowListKind) {
  const profileUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!profileUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const cursor = new URL(req.url).searchParams.get("cursor");
  const rows = await prisma.follow.findMany({
    where: kind === "followers" ? { followingId: profileUser.id } : { followerId: profileUser.id },
    select: {
      id: true,
      follower: kind === "followers" ? { select: userSelect } : false,
      following: kind === "following" ? { select: userSelect } : false,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: FOLLOW_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > FOLLOW_PAGE_SIZE;
  const page = rows.slice(0, FOLLOW_PAGE_SIZE);
  const people = page.map((row) => (kind === "followers" ? row.follower : row.following)!);

  const currentUser = await getCurrentUser();
  const viewerFollows = currentUser
    ? await prisma.follow.findMany({
        where: { followerId: currentUser.id, followingId: { in: people.map((p) => p.id) } },
        select: { followingId: true },
      })
    : [];
  const followingIds = new Set(viewerFollows.map((f) => f.followingId));

  const users: FollowListUser[] = people.map(({ id, username, ...rest }) => ({
    ...rest,
    username: username ?? "",
    isFollowing: followingIds.has(id),
    isSelf: currentUser?.id === id,
  }));

  return NextResponse.json({
    users,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
