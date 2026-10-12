import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.error();
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  const users = await prisma.user.findMany({
    where: {
      username: { contains: query, mode: "insensitive" },
      id: { not: currentUser.id },
    },
    select: { id: true, username: true, image: true, favColour: true, bio: true },
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

  return NextResponse.json(
    users.map(({ id, ...u }) => ({ ...u, isFollowing: followingIds.has(id) }))
  );
}
