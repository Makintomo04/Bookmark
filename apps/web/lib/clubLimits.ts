// Book clubs (BOO-49): the database rules that keep a club inside its limits. The database is passed in
// (lib/clubsServer.ts passes prisma), so scripts/test/clubsServer.test.ts can run them against a stub.
import type { Prisma } from "@prisma/client";
import { CLUB_MAX_MEMBERS, admittedWithinCap } from "@/lib/clubs";

// Archiving a club finishes its open books. Club books stay out of the host's own circle limit only while
// their club is active, so an archived club can't leave books running outside every limit; and a finished
// circle keeps its discussion open, so members part way through can still read and talk.
export async function finishClubBooks(clubId: string, db: Pick<Prisma.TransactionClient, "buddyRead">) {
  const { count } = await db.buddyRead.updateMany({ where: { clubId, status: "ACTIVE" }, data: { status: "FINISHED" } })
  return count
}

// Whether this member is among the first `cap` to join (lib/clubs.ts admittedWithinCap; the cap follows the
// host's plan, clubMemberCap). Joins count after they're written, so two at once can't both pass the cap.
// Ties on joinedAt fall back to the id, which is the order the rows were written.
export async function withinClubCap(clubId: string, userId: string, db: Pick<Prisma.TransactionClient, "clubMember">, cap: number = CLUB_MAX_MEMBERS) {
  const order = await db.clubMember.findMany({ where: { clubId }, orderBy: [{ joinedAt: "asc" }, { id: "asc" }], select: { userId: true } })
  return admittedWithinCap(order.map((m) => m.userId), userId, cap)
}
