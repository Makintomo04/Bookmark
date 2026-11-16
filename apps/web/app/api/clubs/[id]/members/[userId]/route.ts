import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { canEditClubSettings, canRemoveFromClubNow, canSetCoHost, clubMemberUpdateSchema, clubRole } from "@/lib/clubs";
import { isObjectId, parseBody } from "@/lib/buddyReadsServer";
import { clubError, leaveClub, requireClubMembership } from "@/lib/clubsServer";

// A member leaves, or the host or a co-host removes someone (lib/clubs.ts canRemoveFromClubNow: once archived, only the host). Either way
// they leave the club's open circles too; a removal sticks, so the link won't let them back in. The host
// leaves by handing the club to another member (?newHost=<userId>); the only member left archives it instead.
export async function DELETE(req: Request, props: { params: Promise<{ id: string, userId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireClubMembership(params.id, currentUser.id);
  if (notMember) return notMember;
  const { club } = membership;
  if (!isObjectId(params.userId)) return clubError("Reader not found", 404);

  const leaving = params.userId === currentUser.id;
  const target = leaving ? membership.member : await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: params.userId } } });
  if (!target) return clubError("Reader not found", 404);

  if (!leaving) {
    const active = club.status === "ACTIVE";
    if (!canRemoveFromClubNow(membership.role, clubRole(target, club.hostId), active)) {
      if (!active && membership.role === "cohost") return clubError("This club is archived. Only the host can remove readers now.", 403);
      return clubError(membership.role === "cohost" ? "Co-hosts can remove members, but not the host or another co-host." : "Only the host or a co-host can remove readers.", 403);
    }
    await leaveClub(club, params.userId, { removedBy: currentUser.id });
    return NextResponse.json({ removed: true });
  }

  let newHost: string | undefined;
  if (membership.role === "host") {
    const requested = new URL(req.url).searchParams.get("newHost");
    if (!requested) {
      const others = await prisma.clubMember.count({ where: { clubId: club.id, userId: { not: currentUser.id } } });
      return clubError(others === 0 ? "You're the only member. Archive the club instead." : "Choose who'll host the club after you.", 400);
    }
    const successor = isObjectId(requested) && requested !== currentUser.id
      ? await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: requested } }, select: { userId: true } })
      : null;
    if (!successor) return clubError("They aren't in this club any more.", 404);
    newHost = successor.userId;
  }
  await leaveClub(club, currentUser.id, { newHost });
  return NextResponse.json({ removed: true });
}

// Host only: make a member a co-host, or take it away. On an archived club, only take it away (lib/clubs.ts canSetCoHost).
export async function PATCH(req: Request, props: { params: Promise<{ id: string, userId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireClubMembership(params.id, currentUser.id);
  if (notMember) return notMember;
  if (!canEditClubSettings(membership.role)) return clubError("Only the host can choose co-hosts.", 403);
  if (!isObjectId(params.userId) || params.userId === currentUser.id) return clubError("Reader not found", 404);

  const parsed = await parseBody(req, clubMemberUpdateSchema);
  if (parsed.response) return parsed.response;
  if (!canSetCoHost(membership.role, parsed.data.coHost, membership.club.status === "ACTIVE")) return clubError("Reopen the club to choose a new co-host.", 403);

  const updated = await prisma.clubMember.updateMany({ where: { clubId: membership.club.id, userId: params.userId }, data: { coHost: parsed.data.coHost } });
  if (updated.count === 0) return clubError("Reader not found", 404);
  return NextResponse.json({ coHost: parsed.data.coHost });
}
