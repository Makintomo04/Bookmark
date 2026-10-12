import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: { username: string } }
) {
  // Public profile - viewable by anyone, logged in or not. currentUser is
  // only used to compute viewer-specific fields (isFollowing/isSelf) below.
  const currentUser = await getCurrentUser();

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

  const isFollowing = currentUser
    ? !!(await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUser.id,
            followingId: profileUser.id,
          },
        },
      }))
    : false;

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
    isSelf: currentUser ? profileUser.id === currentUser.id : false,
  });
}
