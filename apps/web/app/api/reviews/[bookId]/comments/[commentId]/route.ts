import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { getReviewContext, reviewCommentEditSchema } from "@/lib/reviewComments";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// The comment on this review, if it's still there and the viewer can still read the review it's on.
async function load(bookId: string, commentId: string, viewerId: string) {
  const review = await getReviewContext(bookId, viewerId);
  if (!review || !/^[a-f0-9]{24}$/i.test(commentId)) return null;
  const comment = await prisma.reviewComment.findUnique({ where: { id: commentId }, select: { id: true, bookId: true, userId: true, deletedAt: true } });
  if (!comment || comment.bookId !== review.book.id || comment.deletedAt) return null;
  return { review, comment };
}

// Edit your own comment. Turning comments off (or limiting them to friends) doesn't stop you tidying
// what you already wrote.
export async function PATCH(req: Request, props: { params: Promise<{ bookId: string; commentId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const parsed = reviewCommentEditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Write something first", 400);
  const found = await load(params.bookId, params.commentId, currentUser.id);
  if (!found) return fail("Comment not found", 404);
  if (found.comment.userId !== currentUser.id) return fail("You can only edit your own comment.", 403);
  await prisma.reviewComment.update({ where: { id: found.comment.id }, data: { body: parsed.data.body, editedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

// Delete: the author, or the reviewer from their own review. Soft, so replies keep their place.
export async function DELETE(_req: Request, props: { params: Promise<{ bookId: string; commentId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const found = await load(params.bookId, params.commentId, currentUser.id);
  if (!found) return fail("Comment not found", 404);
  if (found.comment.userId !== currentUser.id && found.review.book.userId !== currentUser.id) return fail("You can't delete that comment.", 403);
  await prisma.reviewComment.update({ where: { id: found.comment.id }, data: { deletedAt: new Date(), body: "" } });
  return NextResponse.json({ ok: true });
}
