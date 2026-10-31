import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { commentPosition, editCommentSchema } from "@/lib/buddyReads";
import { buddyReadError, isObjectId, parseBody, requireMembership } from "@/lib/buddyReadsServer";

async function findComment(buddyReadId: string, commentId: string) {
  if (!isObjectId(commentId)) return null;
  const comment = await prisma.buddyReadComment.findUnique({ where: { id: commentId } });
  return comment && comment.buddyReadId === buddyReadId && !comment.deletedAt ? comment : null;
}

// The author edits their words, or moves the comment earlier ("this is about chapter 3"). Never later:
// that could hide something people have already read, or pin it past where the author is.
export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string, commentId: string }> }
) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireMembership(params.id, currentUser.id);
  if (notMember) return notMember;

  const comment = await findComment(membership.buddyRead.id, params.commentId);
  if (!comment || comment.userId !== currentUser.id) return buddyReadError("Comment not found", 404);

  const parsed = await parseBody(req, editCommentSchema);
  if (parsed.response) return parsed.response;
  const { body, position } = parsed.data;

  let newPosition: number | undefined;
  if (position !== undefined) {
    const parent = comment.parentId
      ? await prisma.buddyReadComment.findUnique({ where: { id: comment.parentId }, select: { position: true } })
      : null;
    newPosition = Math.min(comment.position, commentPosition(position, membership.progress, parent?.position));
  }

  const updated = await prisma.buddyReadComment.update({
    where: { id: comment.id },
    data: {
      ...(body !== undefined && body !== comment.body && { body, editedAt: new Date() }),
      ...(newPosition !== undefined && { position: newPosition }),
    },
    select: { id: true, position: true },
  });
  return NextResponse.json(updated);
}

// The author or the host (in a club's book, also the club's host and co-hosts) removes a comment. It stays as an empty placeholder while it has replies.
export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string, commentId: string }> }
) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireMembership(params.id, currentUser.id);
  if (notMember) return notMember;

  const comment = await findComment(membership.buddyRead.id, params.commentId);
  if (!comment || (comment.userId !== currentUser.id && !membership.canModerate)) return buddyReadError("Comment not found", 404);

  await prisma.buddyReadReaction.deleteMany({ where: { commentId: comment.id } });
  await prisma.buddyReadComment.update({
    where: { id: comment.id },
    data: { body: "", pageLabel: null, chapterLabel: null, deletedAt: new Date() },
  });
  return NextResponse.json({ deleted: true });
}
