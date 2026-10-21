import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { canSeeComment, reportSchema } from "@/lib/buddyReads";
import { buddyReadError, isObjectId, parseBody, requireMembership } from "@/lib/buddyReadsServer";

// Like list reports: a fixed reason, one report per reader per comment, reviewed by staff.
export async function POST(req: Request, { params }: { params: { id: string, commentId: string } }) {
  const { user: currentUser, response } = await requireUser("Sign in to report a comment.");
  if (response) return response;
  const { membership, response: notMember } = await requireMembership(params.id, currentUser.id);
  if (notMember) return notMember;

  const parsed = await parseBody(req, reportSchema);
  if (parsed.response) return parsed.response;

  const limit = rateLimit(`buddy-read-report:${currentUser.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return buddyReadError(tooManyRequestsMessage, 429);

  const comment = isObjectId(params.commentId)
    ? await prisma.buddyReadComment.findUnique({ where: { id: params.commentId }, select: { id: true, buddyReadId: true, userId: true, position: true, deletedAt: true } })
    : null;
  if (!comment || comment.buddyReadId !== membership.buddyRead.id || comment.deletedAt || comment.userId === currentUser.id
    || !canSeeComment(comment, { userId: currentUser.id, progress: membership.progress })) {
    return buddyReadError("Comment not found", 404);
  }

  // Reporting twice is a no-op rather than an error: the reader's intent is already recorded.
  try {
    await prisma.buddyReadCommentReport.create({ data: { commentId: comment.id, reporterId: currentUser.id, reason: parsed.data.reason } });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
  return NextResponse.json({ reported: true });
}
