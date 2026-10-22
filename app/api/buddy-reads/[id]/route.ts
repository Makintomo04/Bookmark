import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { updateBuddyReadSchema } from "@/lib/buddyReads";
import { buddyReadError, loadBuddyReadView, parseBody, requireMembership } from "@/lib/buddyReadsServer";

// The reading circle page polls this. Comments past the viewer's progress come back as locked stubs.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const view = await loadBuddyReadView(params.id, currentUser.id);
  if (!view) return buddyReadError("Reading circle not found", 404);
  return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
}

// Host only: the start date, the schedule, and finishing or archiving it.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireMembership(params.id, currentUser.id);
  if (notMember) return notMember;
  if (!membership.isHost) return buddyReadError("Only the host can change this reading circle.", 403);

  const parsed = await parseBody(req, updateBuddyReadSchema);
  if (parsed.response) return parsed.response;
  const { startsAt, schedule, status } = parsed.data;

  const updated = await prisma.buddyRead.update({
    where: { id: membership.buddyRead.id },
    data: {
      ...(startsAt && { startsAt: new Date(startsAt) }),
      // An empty schedule clears it.
      ...(schedule !== undefined && { schedule: schedule && schedule.length > 0 ? schedule : null }),
      ...(status && { status }),
    },
  });
  return NextResponse.json({ id: updated.id, status: updated.status });
}
