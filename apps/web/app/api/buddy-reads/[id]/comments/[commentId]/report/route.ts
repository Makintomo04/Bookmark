import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { canSeeComment, reportSchema } from "@/lib/buddyReads";
import { buddyReadError, isObjectId, parseBody, requireMembership } from "@/lib/buddyReadsServer";
import { alertReport } from "@/lib/reportAlerts";
import { notifyStaffOfReport } from "@/lib/staffNotify";

// Like list reports: a fixed reason, one report per reader per comment, reviewed by staff.
export async function POST(
  req: Request,
  props: { params: Promise<{ id: string, commentId: string }> }
) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser("Sign in to report a comment.");
  if (response) return response;
  const { membership, response: notMember } = await requireMembership(params.id, currentUser.id);
  if (notMember) return notMember;

  const parsed = await parseBody(req, reportSchema);
  if (parsed.response) return parsed.response;

  const limit = rateLimit(`buddy-read-report:${currentUser.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return buddyReadError(tooManyRequestsMessage, 429);

  const comment = isObjectId(params.commentId)
    ? await prisma.buddyReadComment.findUnique({ where: { id: params.commentId }, select: { id: true, buddyReadId: true, userId: true, position: true, deletedAt: true, body: true } })
    : null;
  if (!comment || comment.buddyReadId !== membership.buddyRead.id || comment.deletedAt || comment.userId === currentUser.id
    || !canSeeComment(comment, { userId: currentUser.id, progress: membership.progress })) {
    return buddyReadError("Comment not found", 404);
  }

  // Reporting twice is a no-op rather than an error: the reader's intent is already recorded, and staff
  // were told the first time.
  try {
    await prisma.buddyReadCommentReport.create({ data: { commentId: comment.id, reporterId: currentUser.id, reason: parsed.data.reason } });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    return NextResponse.json({ reported: true });
  }
  // The email carries the comment as it stood, so an edit or delete afterwards can't hide what was reported.
  await alertReport({
    kind: "comment",
    id: comment.id,
    reason: parsed.data.reason,
    reporterId: currentUser.id,
    authorId: comment.userId,
    excerpt: comment.body,
    path: `/circles/${membership.buddyRead.id}`,
  });
  await notifyStaffOfReport("comment", comment.id);
  return NextResponse.json({ reported: true });
}
