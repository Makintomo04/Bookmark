import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { createBuddyReadSchema } from "@/lib/buddyReads";
import { CIRCLE_SLOTS_MESSAGE, circleSlotsLeft } from "@/lib/clubs";
import { createCircle, isObjectId, parseBody } from "@/lib/buddyReadsServer";
import { addClubToCircle, clubError, requireClubMembership } from "@/lib/clubsServer";
import { settleNewClubBook } from "@/lib/clubLimits";

// The host or a co-host starts the club's next book, from their own shelf: a reading circle in the club,
// with every member added (a new copy goes in Want to read if it hasn't started yet) and told. It counts
// against the club's two open books, not the starter's own hosting limit.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireClubMembership(params.id, currentUser.id);
  if (notMember) return notMember;
  if (!membership.canManage) return clubError("Only the host or a co-host can start the next book.", 403);

  const parsed = await parseBody(req, createBuddyReadSchema);
  if (parsed.response) return parsed.response;
  const { bookId, startsAt, schedule } = parsed.data;

  const limit = rateLimit(`club-circle-create:${currentUser.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return clubError(tooManyRequestsMessage, 429);

  const book = isObjectId(bookId) ? await prisma.book.findUnique({ where: { id: bookId } }) : null;
  if (!book || book.userId !== currentUser.id) return clubError("Book not found", 404);

  const open = await prisma.buddyRead.count({ where: { clubId: membership.club.id, status: "ACTIVE" } });
  if (circleSlotsLeft(open) === 0) return clubError(CIRCLE_SLOTS_MESSAGE, 409);

  const circle = await createCircle(book, currentUser.id, { startsAt, schedule, clubId: membership.club.id });
  await addClubToCircle(circle, membership.club.id, currentUser.id);
  // Archived meanwhile: the book is finished with the rest, so it doesn't run outside every limit.
  await settleNewClubBook(membership.club.id, prisma);
  return NextResponse.json({ id: circle.id });
}
