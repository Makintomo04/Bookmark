import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { buddyReadError, newInviteCode, requireMembership } from "@/lib/buddyReadsServer";

// Host only (and a club's co-hosts, in its circle): a new invite link. The old one stops working at once; everyone already in stays, and
// invites sent by username still work (they look the code up when opened).
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireMembership(params.id, currentUser.id);
  if (notMember) return notMember;
  if (!membership.canManage) return buddyReadError("Only the host can reset the invite link.", 403);
  if (membership.buddyRead.status === "ARCHIVED") return buddyReadError("This reading circle has ended.", 409);

  const limit = rateLimit(`buddy-read-invite-link:${currentUser.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return buddyReadError(tooManyRequestsMessage, 429);

  const updated = await prisma.buddyRead.update({
    where: { id: membership.buddyRead.id },
    data: { inviteCode: await newInviteCode() },
    select: { inviteCode: true },
  });
  return NextResponse.json(updated);
}
