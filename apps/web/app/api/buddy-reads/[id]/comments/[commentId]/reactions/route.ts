import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { canSeeComment, reactionSchema } from "@/lib/buddyReads";
import { buddyReadError, isObjectId, parseBody, requireMembership } from "@/lib/buddyReadsServer";

// One tap toggles an emoji on a comment you can read.
export async function POST(req: Request, { params }: { params: { id: string, commentId: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireMembership(params.id, currentUser.id);
  if (notMember) return notMember;

  const parsed = await parseBody(req, reactionSchema);
  if (parsed.response) return parsed.response;
  const { emoji } = parsed.data;

  const limit = rateLimit(`buddy-read-reaction:${currentUser.id}`, 60, 60 * 1000);
  if (!limit.ok) return buddyReadError("Slow down a little.", 429);

  const comment = isObjectId(params.commentId)
    ? await prisma.buddyReadComment.findUnique({ where: { id: params.commentId }, select: { id: true, buddyReadId: true, userId: true, position: true, deletedAt: true } })
    : null;
  // A locked comment looks missing: reacting would confirm what's there.
  if (!comment || comment.buddyReadId !== membership.buddyRead.id || comment.deletedAt
    || !canSeeComment(comment, { userId: currentUser.id, progress: membership.progress })) {
    return buddyReadError("Comment not found", 404);
  }

  const where = { commentId_userId_emoji: { commentId: comment.id, userId: currentUser.id, emoji } };
  const existing = await prisma.buddyReadReaction.findUnique({ where, select: { id: true } });
  if (existing) {
    await prisma.buddyReadReaction.deleteMany({ where: { id: existing.id } });
    return NextResponse.json({ reacted: false });
  }
  try {
    await prisma.buddyReadReaction.create({ data: { commentId: comment.id, userId: currentUser.id, emoji } });
  } catch (e) {
    // A double tap: the other request already added it.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
  return NextResponse.json({ reacted: true });
}
