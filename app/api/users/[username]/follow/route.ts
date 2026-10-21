import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { username: string } }
) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const targetUser = await prisma.user.findUnique({
    where: { username: params.username },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (targetUser.id === currentUser.id) {
    return NextResponse.json({ error: "You can't follow yourself." }, { status: 400 });
  }

  const existing = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: currentUser.id,
        followingId: targetUser.id,
      },
    },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    return NextResponse.json({ isFollowing: false });
  }

  await prisma.follow.create({
    data: { followerId: currentUser.id, followingId: targetUser.id },
  });
  await prisma.notification.create({
    data: { userId: targetUser.id, actorId: currentUser.id, type: "NEW_FOLLOWER" },
  });
  return NextResponse.json({ isFollowing: true });
}
