import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { updateBuddyReadSchema } from "@/lib/buddyReads";
import { buddyReadError, canHostAnotherCircle, canInheritAnotherCircle, hostingRefusal, loadBuddyReadView, markCircleSeen, parseBody, requireMembership } from "@/lib/buddyReadsServer";

// The reading circle page polls this. Comments past the viewer's progress come back as locked stubs.
// Having it open marks the circle's comment notifications read.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const view = await loadBuddyReadView(params.id, currentUser.id);
  if (!view) return buddyReadError("Reading circle not found", 404);
  await markCircleSeen(view.buddyRead.id, currentUser.id);
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

  // Reopening a finished or archived circle makes it active again, so it counts against the hosting limit:
  // the inherited cap for one handed on to them, the usual one for a circle they started.
  if (status === "ACTIVE" && membership.buddyRead.status !== "ACTIVE") {
    const hosting = membership.buddyRead.inheritedAt
      ? await canInheritAnotherCircle(currentUser.id)
      : await canHostAnotherCircle(currentUser.id);
    if (!hosting.allowed) return hostingRefusal(hosting);
  }

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
