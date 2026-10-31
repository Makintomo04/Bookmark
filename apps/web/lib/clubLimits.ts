// Book clubs (BOO-49): the database rules that keep a club inside its limits. The database is passed in
// (lib/clubsServer.ts passes prisma), so scripts/test/clubsServer.test.ts can run them against a stub.
import type { Prisma } from "@prisma/client";
import { admittedWithinCap } from "@/lib/clubs";

// Archiving a club finishes its open books. Club books stay out of the host's own circle limit only while
// their club is active, so an archived club can't leave books running outside every limit; and a finished
// circle keeps its discussion open, so members part way through can still read and talk.
export async function finishClubBooks(clubId: string, db: Pick<Prisma.TransactionClient, "buddyRead">) {
  const { count } = await db.buddyRead.updateMany({ where: { clubId, status: "ACTIVE" }, data: { status: "FINISHED" } })
  return count
}

// Starting the club's next book checks the club is active when the request starts, but the host can archive it
// before the book is written. So the club is read again once it is: archived by then, its books are finished
// again, the new one with them. The archive route finishes them once more after it commits, so whichever of
// the two lands second catches the new book. Whether the club was still active.
export async function settleNewClubBook(clubId: string, db: Pick<Prisma.TransactionClient, "club" | "buddyRead">) {
  const club = await db.club.findUnique({ where: { id: clubId }, select: { status: true } })
  if (club?.status === "ACTIVE") return true
  await finishClubBooks(clubId, db)
  return false
}

// Whether this member is among the first CLUB_MAX_MEMBERS to join (lib/clubs.ts admittedWithinCap). Joins
// count after they're written, so two at once can't both pass the cap. Ties on joinedAt fall back to the
// id, which is the order the rows were written.
export async function withinClubCap(clubId: string, userId: string, db: Pick<Prisma.TransactionClient, "clubMember">) {
  const order = await db.clubMember.findMany({ where: { clubId }, orderBy: [{ joinedAt: "asc" }, { id: "asc" }], select: { userId: true } })
  return admittedWithinCap(order.map((m) => m.userId), userId)
}
