import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.error();
  }

  const follows = await prisma.follow.findMany({
    where: { followerId: currentUser.id },
    select: { followingId: true },
  })
  const followingIds = follows.map(f => f.followingId)

  if (followingIds.length === 0) {
    return NextResponse.json([])
  }

  const activities = await prisma.activity.findMany({
    where: { userId: { in: followingIds } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      user: { select: { username: true, image: true, favColour: true } },
      book: { select: { title: true, author: true, coverImage: true, cardColour: true, rating: true } },
    },
  })

  return NextResponse.json(activities)
}
