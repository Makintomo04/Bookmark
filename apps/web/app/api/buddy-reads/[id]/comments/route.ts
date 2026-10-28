import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { canSeeComment, commentPosition, commentSchema } from "@/lib/buddyReads";
import { buddyReadError, isObjectId, notifyNewComment, parseBody, requireMembership } from "@/lib/buddyReadsServer";

// Posts a comment pinned to a point in the book: the author's progress, or lower if they say so.
// A reply sits with its parent (or later), and you can only reply to what you can read. Members who've
// already read that far are told about it (notifyNewComment).
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireMembership(params.id, currentUser.id);
  if (notMember) return notMember;
  const { buddyRead, progress } = membership;
  if (buddyRead.status === "ARCHIVED") return buddyReadError("This reading circle has ended.", 409);

  const parsed = await parseBody(req, commentSchema);
  if (parsed.response) return parsed.response;
  const { body, position, pageLabel, chapterLabel, parentId } = parsed.data;

  const limit = rateLimit(`buddy-read-comment:${currentUser.id}`, 10, 60 * 1000);
  if (!limit.ok) return buddyReadError("You're commenting very fast. Give it a minute.", 429);

  let parentPosition: number | undefined;
  if (parentId) {
    const parent = isObjectId(parentId)
      ? await prisma.buddyReadComment.findUnique({ where: { id: parentId }, select: { buddyReadId: true, userId: true, position: true, parentId: true, deletedAt: true } })
      : null;
    if (!parent || parent.buddyReadId !== buddyRead.id || parent.deletedAt || !canSeeComment(parent, { userId: currentUser.id, progress })) {
      return buddyReadError("That comment isn't there any more.", 404);
    }
    if (parent.parentId) return buddyReadError("Replies are one level deep. Reply to the comment above instead.", 400);
    parentPosition = parent.position;
  }

  const comment = await prisma.buddyReadComment.create({
    data: {
      buddyReadId: buddyRead.id,
      userId: currentUser.id,
      position: commentPosition(position, progress, parentPosition),
      pageLabel,
      chapterLabel,
      body,
      parentId: parentId ?? null,
    },
    select: { id: true, position: true },
  });
  // Members already past it hear now; the rest when their progress reaches it.
  await notifyNewComment(buddyRead.id, { userId: currentUser.id, position: comment.position });
  return NextResponse.json(comment);
}
