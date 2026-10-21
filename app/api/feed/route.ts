import { booksReadCount } from "@/lib/readerTier";
import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

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
      user: { select: { username: true, image: true, favColour: true, ...booksReadCount } },
      book: { select: { title: true, author: true, coverImage: true, cardColour: true, rating: true } },
    },
  })

  return NextResponse.json(activities)
}
