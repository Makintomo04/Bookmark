import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { getReviewContext, reviewCommentReportSchema } from "@/lib/reviewComments";
import { alertReport } from "@/lib/reportAlerts";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// Like reading-circle comment reports: a fixed reason, one report per reader per comment, and staff are
// emailed the comment as it stood. Only a comment on a review you can read may be reported, never your own.
export async function POST(req: Request, props: { params: Promise<{ bookId: string; commentId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser("Sign in to report a comment.");
  if (response) return response;
  const parsed = reviewCommentReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Choose a reason.", 400);
  const limit = rateLimit(`review-comment-report:${currentUser.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return fail(tooManyRequestsMessage, 429);

  const review = await getReviewContext(params.bookId, currentUser.id);
  const comment = review && /^[a-f0-9]{24}$/i.test(params.commentId)
    ? await prisma.reviewComment.findUnique({ where: { id: params.commentId }, select: { id: true, bookId: true, userId: true, body: true, deletedAt: true } })
    : null;
  if (!review || !comment || comment.bookId !== review.book.id || comment.deletedAt || comment.userId === currentUser.id) return fail("Comment not found", 404);

  try {
    await prisma.reviewCommentReport.create({ data: { commentId: comment.id, reporterId: currentUser.id, reason: parsed.data.reason, status: "OPEN" } });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    return NextResponse.json({ reported: true });
  }
  await alertReport({
    kind: "reviewComment",
    id: comment.id,
    reason: parsed.data.reason,
    reporterId: currentUser.id,
    authorId: comment.userId,
    excerpt: comment.body,
    path: `/u/${review.owner.username}/reviews/${review.book.id}`,
  });
  return NextResponse.json({ reported: true });
}
