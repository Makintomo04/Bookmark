import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { clubError, newClubInviteCode, requireClubMembership } from "@/lib/clubsServer";

// The host or a co-host: a new invite link for the club. The old one stops working at once; everyone
// already in stays.
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireClubMembership(params.id, currentUser.id);
  if (notMember) return notMember;
  if (!membership.canManage) return clubError("Only the host or a co-host can reset the invite link.", 403);

  const limit = rateLimit(`club-invite-link:${currentUser.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return clubError(tooManyRequestsMessage, 429);

  const updated = await prisma.club.update({
    where: { id: membership.club.id },
    data: { inviteCode: await newClubInviteCode() },
    select: { inviteCode: true },
  });
  return NextResponse.json(updated);
}
