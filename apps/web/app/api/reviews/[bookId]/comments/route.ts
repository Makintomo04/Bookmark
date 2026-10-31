import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { blockedUserIds } from "@/lib/privacy";
import { createNotifications } from "@/lib/notifications";
import { getReviewContext, reviewCommentSchema } from "@/lib/reviewComments";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// Writes a comment on a review (or a reply to one). The rules are enforced here, not just hidden in the page:
// the review must be one this reader can read (getReviewContext), and the reviewer's "who can comment"
// setting must allow them (canCommentOnReview). Anything else comes back as the review not being there.
export async function POST(req: Request, props: { params: Promise<{ bookId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser("Sign in to comment.");
  if (response) return response;

  const parsed = reviewCommentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Write something first", 400);
  const { body, parentId } = parsed.data;

  const review = await getReviewContext(params.bookId, currentUser.id);
  if (!review) return fail("Review not found", 404);
  if (!review.canComment) {
    return fail(review.audience === "OFF" ? "Comments are off for this review." : "Only the reviewer's friends can comment on this review.", 403);
  }

  const limit = rateLimit(`review-comment:${currentUser.id}`, 10, 60 * 1000);
  if (!limit.ok) return fail("You're commenting very fast. Give it a minute.", 429);

  let parent: { id: string; userId: string; parentId: string | null; deletedAt: Date | null; bookId: string } | null = null;
  if (parentId) {
    parent = /^[a-f0-9]{24}$/i.test(parentId)
      ? await prisma.reviewComment.findUnique({ where: { id: parentId }, select: { id: true, userId: true, parentId: true, deletedAt: true, bookId: true } })
      : null;
    if (!parent || parent.bookId !== review.book.id || parent.deletedAt) return fail("That comment isn't there any more.", 404);
    if (parent.parentId) return fail("Replies are one level deep. Reply to the comment above instead.", 400);
  }

  const comment = await prisma.reviewComment.create({
    data: { bookId: review.book.id, userId: currentUser.id, body, parentId: parent?.id ?? null },
    select: { id: true },
  });

  // The reviewer hears of every comment on their review; a reply also tells whoever it answers. Never
  // yourself, never twice, and never across a block.
  const blocked = new Set(await blockedUserIds(currentUser.id));
  const targets: { userId: string; type: "REVIEW_COMMENT" | "REVIEW_REPLY" }[] = [];
  if (parent) targets.push({ userId: parent.userId, type: "REVIEW_REPLY" });
  targets.push({ userId: review.book.userId, type: "REVIEW_COMMENT" });
  const seen = new Set<string>([currentUser.id]);
  await createNotifications(targets.filter((t) => {
    if (seen.has(t.userId) || blocked.has(t.userId)) return false;
    seen.add(t.userId);
    return true;
  }).map((t) => ({ userId: t.userId, actorId: currentUser.id, type: t.type, bookId: review.book.id, commentId: comment.id })));

  return NextResponse.json(comment);
}
