import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { canMuteInClub, clubRole } from "@/lib/clubs";
import { isObjectId } from "@/lib/buddyReadsServer";
import { clubError, requireClubMembership } from "@/lib/clubsServer";

// Host tools for big clubs (BOO-79): the host or a co-host mutes a member (POST) or unmutes them (DELETE).
// A muted member still reads along and votes, but can't comment in the club's books or nominate. Who may
// mute whom follows removing (lib/clubs.ts canMuteInClub): a co-host only members, never the host.
async function setMuted(req: Request, props: { params: Promise<{ id: string, userId: string }> }, muted: boolean) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireClubMembership(params.id, currentUser.id);
  if (notMember) return notMember;
  const { club } = membership;
  if (!isObjectId(params.userId) || params.userId === currentUser.id) return clubError("Reader not found", 404);

  const target = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: params.userId } } });
  if (!target) return clubError("Reader not found", 404);
  if (club.status !== "ACTIVE" || !canMuteInClub(membership.role, clubRole(target, club.hostId))) {
    return clubError(membership.role === "cohost" ? "Co-hosts can mute members, but not the host or another co-host." : "Only the host or a co-host can mute readers.", 403);
  }
  await prisma.clubMember.update({ where: { id: target.id }, data: { hostMutedAt: muted ? new Date() : null } });
  return NextResponse.json({ muted });
}

export const POST = (req: Request, props: { params: Promise<{ id: string, userId: string }> }) => setMuted(req, props, true);
export const DELETE = (req: Request, props: { params: Promise<{ id: string, userId: string }> }) => setMuted(req, props, false);
