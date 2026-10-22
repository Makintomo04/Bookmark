import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { buddyReadError, isObjectId, requireMembership } from "@/lib/buddyReadsServer";

// The host removes a member, or a member leaves. The host can't leave; they archive it instead.
// A removed member's comments drop out of everyone's view along with them.
export async function DELETE(req: Request, { params }: { params: { id: string, userId: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireMembership(params.id, currentUser.id);
  if (notMember) return notMember;

  const leaving = params.userId === currentUser.id;
  if (leaving && membership.isHost) return buddyReadError("Hosts can't leave. Archive the circle instead.", 400);
  if (!leaving && !membership.isHost) return buddyReadError("Only the host can remove readers.", 403);
  if (!isObjectId(params.userId)) return buddyReadError("Reader not found", 404);

  const removed = await prisma.buddyReadMember.deleteMany({ where: { buddyReadId: membership.buddyRead.id, userId: params.userId } });
  if (removed.count === 0) return buddyReadError("Reader not found", 404);
  return NextResponse.json({ removed: true });
}
