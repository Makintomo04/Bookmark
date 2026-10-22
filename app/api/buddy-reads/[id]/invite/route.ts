import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { BUDDY_READ_MAX_MEMBERS } from "@/lib/buddyReads";
import { buddyReadError, isBlockedEitherWay, isObjectId, parseBody, requireMembership } from "@/lib/buddyReadsServer";

const inviteSchema = z.object({ username: z.string().trim().min(1, "Enter a username").max(60) });

// Any member can invite a reader by username. Following isn't needed, and the invite link works without this.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireMembership(params.id, currentUser.id);
  if (notMember) return notMember;
  const { buddyRead } = membership;
  if (buddyRead.status === "ARCHIVED") return buddyReadError("This circle has ended.", 409);

  const parsed = await parseBody(req, inviteSchema);
  if (parsed.response) return parsed.response;

  const limit = rateLimit(`buddy-read-invite:${currentUser.id}`, 30, 60 * 60 * 1000);
  if (!limit.ok) return buddyReadError(tooManyRequestsMessage, 429);

  const invitee = await prisma.user.findUnique({ where: { username: parsed.data.username.replace(/^@/, "") }, select: { id: true } });
  // Blocked readers look the same as unknown ones.
  if (!invitee || (await isBlockedEitherWay(currentUser.id, invitee.id)) || (await isBlockedEitherWay(buddyRead.hostId, invitee.id))) {
    return buddyReadError("No reader with that username.", 404);
  }
  if (invitee.id === currentUser.id) return buddyReadError("You're already here.", 400);

  const [isMember, count] = await Promise.all([
    prisma.buddyReadMember.findUnique({ where: { buddyReadId_userId: { buddyReadId: buddyRead.id, userId: invitee.id } }, select: { id: true } }),
    prisma.buddyReadMember.count({ where: { buddyReadId: buddyRead.id } }),
  ]);
  if (isMember) return buddyReadError("They're already reading along.", 409);
  if (count >= BUDDY_READ_MAX_MEMBERS) return buddyReadError(`This circle is full (${BUDDY_READ_MAX_MEMBERS} readers).`, 409);

  // Inviting twice is a no-op, so nobody gets a second notification.
  const existing = await prisma.buddyReadInvite.findUnique({ where: { buddyReadId_inviteeId: { buddyReadId: buddyRead.id, inviteeId: invitee.id } } });
  if (!existing) {
    await prisma.buddyReadInvite.create({ data: { buddyReadId: buddyRead.id, inviterId: currentUser.id, inviteeId: invitee.id } });
    await prisma.notification.create({
      data: { userId: invitee.id, actorId: currentUser.id, type: "BUDDY_READ_INVITE", buddyReadId: buddyRead.id, count: 1 },
    });
  }
  return NextResponse.json({ invited: true });
}

// The invitee declines.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  if (!isObjectId(params.id)) return buddyReadError("Invite not found", 404);
  await prisma.buddyReadInvite.deleteMany({ where: { buddyReadId: params.id, inviteeId: currentUser.id } });
  return NextResponse.json({ declined: true });
}
