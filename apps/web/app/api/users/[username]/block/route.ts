import { requireUser } from "@/lib/apiAuth";
import { handleOf } from "@/lib/handle";
import prisma from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { NextResponse } from "next/server";

async function findTarget(username: string) {
  return prisma.user.findUnique({ where: { username }, select: { id: true } });
}

// Block: they can't follow you or see your profile, reviews or activity, and you both drop out of
// each other's search. Existing follows in both directions are removed.
export async function POST(
  req: Request,
  { params }: { params: { username: string } }
) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const target = await findTarget(handleOf(params.username));
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.id === currentUser.id) {
    return NextResponse.json({ error: "You can't block yourself." }, { status: 400 });
  }
  const limit = rateLimit(`block:${currentUser.id}`, 30, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many blocks. Try again later." }, { status: 429 });
  }

  const pair = { blockerId: currentUser.id, blockedId: target.id };
  await prisma.$transaction([
    prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: currentUser.id, followingId: target.id },
          { followerId: target.id, followingId: currentUser.id },
        ],
      },
    }),
    // And any follow request pending either way.
    prisma.followRequest.deleteMany({
      where: {
        OR: [
          { requesterId: currentUser.id, targetId: target.id },
          { requesterId: target.id, targetId: currentUser.id },
        ],
      },
    }),
    // Their "followed you" and "asked to follow" notifications go too, so they can't link back to them.
    prisma.notification.deleteMany({ where: { userId: currentUser.id, actorId: target.id, type: { in: ["NEW_FOLLOWER", "FOLLOW_REQUEST"] } } }),
    prisma.block.upsert({
      where: { blockerId_blockedId: pair },
      create: pair,
      update: {},
    }),
  ]);

  return NextResponse.json({ isBlocked: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: { username: string } }
) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const target = await findTarget(handleOf(params.username));
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Follows removed by the block stay removed.
  await prisma.block.deleteMany({ where: { blockerId: currentUser.id, blockedId: target.id } });
  return NextResponse.json({ isBlocked: false });
}
