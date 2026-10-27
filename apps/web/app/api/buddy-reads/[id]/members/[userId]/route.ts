import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { z } from "zod";
import { buddyReadError, canInheritAnotherCircle, handOverHosting, isObjectId, parseBody, requireMembership } from "@/lib/buddyReadsServer";

// The host removes a member, or a member leaves. A host leaves by handing the circle to another member
// (?newHost=<userId>); the only reader left can't leave, they archive it instead. Whoever leaves keeps
// their comments, under their name. A removal sticks: the invite link won't let them back in.
export async function DELETE(req: Request, { params }: { params: { id: string, userId: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireMembership(params.id, currentUser.id);
  if (notMember) return notMember;
  const { buddyRead } = membership;

  const leaving = params.userId === currentUser.id;
  if (!leaving && !membership.isHost) return buddyReadError("Only the host can remove readers.", 403);
  if (!isObjectId(params.userId)) return buddyReadError("Reader not found", 404);

  if (leaving && membership.isHost) {
    const newHost = new URL(req.url).searchParams.get("newHost");
    if (!newHost) {
      const others = await prisma.buddyReadMember.count({ where: { buddyReadId: buddyRead.id, userId: { not: currentUser.id } } });
      return buddyReadError(others === 0
        ? "You're the only reader here. Archive the reading circle instead."
        : "Choose who'll host the reading circle after you.", 400);
    }
    const successor = isObjectId(newHost) && newHost !== currentUser.id
      ? await prisma.buddyReadMember.findUnique({ where: { buddyReadId_userId: { buddyReadId: buddyRead.id, userId: newHost } }, select: { userId: true } })
      : null;
    const successorUser = successor ? await prisma.user.findUnique({ where: { id: successor.userId }, select: { username: true } }) : null;
    if (!successor || !successorUser) return buddyReadError("They aren't in this reading circle any more.", 404);
    // A handed-on circle counts against their inherited cap, so a second account can't feed circles to a main one.
    if (buddyRead.status === "ACTIVE" && !(await canInheritAnotherCircle(successor.userId)).allowed) {
      return buddyReadError(`${successorUser.username ?? "They"} can't take on another reading circle right now. Choose someone else.`, 409);
    }
    await handOverHosting(buddyRead, successor.userId, { from: currentUser.id });
  }

  const removed = await prisma.buddyReadMember.deleteMany({ where: { buddyReadId: buddyRead.id, userId: params.userId } });
  if (removed.count === 0) return buddyReadError("Reader not found", 404);
  if (!leaving) {
    await prisma.buddyReadRemoval.upsert({
      where: { buddyReadId_userId: { buddyReadId: buddyRead.id, userId: params.userId } },
      create: { buddyReadId: buddyRead.id, userId: params.userId },
      update: { removedAt: new Date() },
    });
    await prisma.buddyReadInvite.deleteMany({ where: { buddyReadId: buddyRead.id, inviteeId: params.userId } });
  }
  return NextResponse.json({ removed: true });
}

// A member mutes or unmutes the circle for themselves: no comment notifications while muted, bell or
// push. Invites, joins and hosting changes still arrive.
export async function PATCH(req: Request, { params }: { params: { id: string, userId: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  if (params.userId !== currentUser.id) return buddyReadError("You can only mute a reading circle for yourself.", 403);
  const { membership, response: notMember } = await requireMembership(params.id, currentUser.id);
  if (notMember) return notMember;

  const parsed = await parseBody(req, z.object({ muted: z.boolean() }));
  if (parsed.response) return parsed.response;
  const { muted } = parsed.data;
  await prisma.buddyReadMember.update({ where: { id: membership.member.id }, data: { mutedAt: muted ? new Date() : null } });
  return NextResponse.json({ muted });
}
