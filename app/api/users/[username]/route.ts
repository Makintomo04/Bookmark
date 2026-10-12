import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: { username: string } }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.error();
  }

  const profileUser = await prisma.user.findUnique({
    where: { username: params.username },
    include: {
      books: {
        where: { status: { in: ["STARTED", "COMPLETED"] } },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: { followers: true, following: true },
      },
    },
  });

  if (!profileUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const isFollowing = !!(await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: currentUser.id,
        followingId: profileUser.id,
      },
    },
  }));

  return NextResponse.json({
    id: profileUser.id,
    username: profileUser.username,
    bio: profileUser.bio,
    image: profileUser.image,
    banner: profileUser.banner,
    favColour: profileUser.favColour,
    createdAt: profileUser.createdAt,
    books: profileUser.books,
    followerCount: profileUser._count.followers,
    followingCount: profileUser._count.following,
    isFollowing,
    isSelf: profileUser.id === currentUser.id,
  });
}
