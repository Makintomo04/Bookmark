import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { canEditClubSettings, clubAbout, updateClubSchema } from "@/lib/clubs";
import { hostingRefusal, parseBody } from "@/lib/buddyReadsServer";
import { canHostAnotherClub, clubError, finishClubBooks, loadClubView, requireClubMembership } from "@/lib/clubsServer";

// The club page: members, roles, and what it's reading, what's next and what it's read.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const view = await loadClubView(params.id, currentUser.id);
  if (!view) return clubError("Club not found", 404);
  return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
}

// Host only: the name, the line about it, and archiving or reopening it. Archiving closes the link and
// marks its open books finished (lib/clubsServer.ts finishClubBooks); their discussions stay open.
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireClubMembership(params.id, currentUser.id);
  if (notMember) return notMember;
  if (!canEditClubSettings(membership.role)) return clubError("Only the host can change the club.", 403);

  const parsed = await parseBody(req, updateClubSchema);
  if (parsed.response) return parsed.response;
  const { name, about, status } = parsed.data;

  // Reopening counts against the hosting limit again.
  if (status === "ACTIVE" && membership.club.status !== "ACTIVE") {
    const hosting = await canHostAnotherClub(currentUser.id);
    if (!hosting.allowed) return hostingRefusal(hosting);
  }

  // One transaction, so a failure part way never leaves an active club with its books finished.
  const updated = await prisma.$transaction(async (tx) => {
    if (status === "ARCHIVED" && membership.club.status !== "ARCHIVED") await finishClubBooks(membership.club.id, tx);
    return tx.club.update({
      where: { id: membership.club.id },
      data: {
        ...(name && { name }),
        ...(about !== undefined && { about: clubAbout(about) }),
        ...(status && { status }),
      },
    });
  });
  // A book started while this ran isn't in what the transaction read: finish it now (lib/clubLimits.ts settleNewClubBook).
  if (status === "ARCHIVED" && membership.club.status !== "ARCHIVED") await finishClubBooks(membership.club.id, prisma);
  return NextResponse.json({ id: updated.id, status: updated.status });
}
