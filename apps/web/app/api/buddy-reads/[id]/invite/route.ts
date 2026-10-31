import { NextResponse } from "next/server";
import { findUserByUsername } from "@/lib/userLookup";
import { handleOf } from "@/lib/handle";
import { z } from "zod";
import prisma from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { BUDDY_READ_MAX_MEMBERS } from "@/lib/buddyReads";
import { acceptsBuddyReadInvite, preferencesOf, preferencesSelect } from "@/lib/preferences";
import { CLUB_CLOSED_MESSAGE, buddyReadError, isBlockedEitherWay, isObjectId, parseBody, requireMembership } from "@/lib/buddyReadsServer";
import { areFriends } from "@/lib/friends";

const inviteSchema = z.object({ username: z.string().trim().min(1, "Enter a username").max(60) });

// Any member can invite a reader by username, if the reader's buddyReadInvites preference allows it.
// The invite link works regardless: joining through it is the reader's own choice.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireMembership(params.id, currentUser.id);
  if (notMember) return notMember;
  const { buddyRead } = membership;
  if (buddyRead.status === "ARCHIVED") return buddyReadError("This reading circle has ended.", 409);

  const parsed = await parseBody(req, inviteSchema);
  if (parsed.response) return parsed.response;

  const limit = rateLimit(`buddy-read-invite:${currentUser.id}`, 30, 60 * 60 * 1000);
  if (!limit.ok) return buddyReadError(tooManyRequestsMessage, 429);

  const invitee = await findUserByUsername(handleOf(parsed.data.username.replace(/^@/, "")), { id: true, ...preferencesSelect });
  // Blocked readers look the same as unknown ones.
  if (!invitee || (await isBlockedEitherWay(currentUser.id, invitee.id)) || (await isBlockedEitherWay(buddyRead.hostId, invitee.id))) {
    return buddyReadError("No reader with that username.", 404);
  }
  if (invitee.id === currentUser.id) return buddyReadError("You're already here.", 400);

  // Only the lookup their audience needs: a follow for FOLLOWING, follows both ways for FRIENDS.
  const preferences = preferencesOf(invitee);
  const inviteeFollowsInviter = preferences.buddyReadInvites === "FOLLOWING"
    && !!(await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: invitee.id, followingId: currentUser.id } }, select: { id: true } }));
  const friends = preferences.buddyReadInvites === "FRIENDS" && (await areFriends(invitee.id, currentUser.id));
  if (!acceptsBuddyReadInvite(preferences, { inviteeFollowsInviter, friends })) {
    return buddyReadError("They aren't taking invites from you. Send them the invite link instead.", 403);
  }

  const [isMember, count] = await Promise.all([
    prisma.buddyReadMember.findUnique({ where: { buddyReadId_userId: { buddyReadId: buddyRead.id, userId: invitee.id } }, select: { id: true } }),
    prisma.buddyReadMember.count({ where: { buddyReadId: buddyRead.id } }),
  ]);
  if (isMember) return buddyReadError("They're already reading along.", 409);
  // Someone the host removed only comes back if the host asks them to; inviting them lifts the removal.
  const removal = await prisma.buddyReadRemoval.findUnique({ where: { buddyReadId_userId: { buddyReadId: buddyRead.id, userId: invitee.id } }, select: { id: true } });
  if (removal && !membership.canManage) return buddyReadError("The host removed them from this reading circle. Only the host can invite them back.", 403);
  if (count >= BUDDY_READ_MAX_MEMBERS) return buddyReadError(`This reading circle is full (${BUDDY_READ_MAX_MEMBERS} readers).`, 409);
  // In a club's circle, accepting joins the club (the join route), so a removal from the club counts the same way.
  const clubRemoval = buddyRead.clubId
    ? await prisma.clubRemoval.findUnique({ where: { clubId_userId: { clubId: buddyRead.clubId, userId: invitee.id } }, select: { id: true } })
    : null;
  if (clubRemoval && !membership.canManage) return buddyReadError("They were removed from this club. Only the host or a co-host can invite them back.", 403);
  // Once the club is archived its books take no one new (lib/buddyReadsServer.ts clubBookRefusal).
  if (buddyRead.clubId) {
    const [club, inClub] = await Promise.all([
      prisma.club.findUnique({ where: { id: buddyRead.clubId }, select: { status: true } }),
      prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: buddyRead.clubId, userId: invitee.id } }, select: { id: true } }),
    ]);
    if (club?.status !== "ACTIVE" && !inClub) return buddyReadError(CLUB_CLOSED_MESSAGE, 409);
  }
  if (clubRemoval) await prisma.clubRemoval.delete({ where: { id: clubRemoval.id } });

  // Inviting twice is a no-op, so nobody gets a second notification.
  const existing = await prisma.buddyReadInvite.findUnique({ where: { buddyReadId_inviteeId: { buddyReadId: buddyRead.id, inviteeId: invitee.id } } });
  if (removal) await prisma.buddyReadRemoval.delete({ where: { id: removal.id } });
  if (!existing) {
    await prisma.buddyReadInvite.create({ data: { buddyReadId: buddyRead.id, inviterId: currentUser.id, inviteeId: invitee.id } });
    await createNotification({ userId: invitee.id, actorId: currentUser.id, type: "BUDDY_READ_INVITE", buddyReadId: buddyRead.id, count: 1 });
  }
  return NextResponse.json({ invited: true });
}

// The invitee declines.
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  if (!isObjectId(params.id)) return buddyReadError("Invite not found", 404);
  await prisma.buddyReadInvite.deleteMany({ where: { buddyReadId: params.id, inviteeId: currentUser.id } });
  return NextResponse.json({ declined: true });
}
