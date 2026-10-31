import prisma from "@/lib/db";
import { blockedAmong } from "@/lib/buddyReadsServer";
import { notSuspendedWhere } from "@/lib/privacy";
import type { Prisma } from "@prisma/client";

// Counts of what's happening in a circle, for the checkpoint push and the weekly email, by the circle
// page's own rules (lib/buddyReadsServer.ts loadBuddyReadView): a blocked reader's comments drop out, and
// so do a suspended writer's until it ends, along with any reply under them. A blocked reader also drops
// out of the track; a suspended one stays on it. Counts only, never words.

// MongoDB: a soft-deleted comment has deletedAt set; most never had the field.
const liveComment = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } satisfies Prisma.BuddyReadCommentWhereInput;

const others = (viewerId: string, ids: string[]) => Array.from(new Set(ids.filter((id) => id !== viewerId)));

// Writers whose comments this viewer doesn't see: blocked either way, or suspended.
async function hiddenWriters(viewerId: string, ids: string[]): Promise<Set<string>> {
  const people = others(viewerId, ids);
  if (people.length === 0) return new Set();
  const [blocked, suspended] = await Promise.all([
    blockedAmong(viewerId, people),
    prisma.user.findMany({ where: { id: { in: people }, NOT: notSuspendedWhere() }, select: { id: true } }),
  ]);
  return new Set([...blocked, ...suspended.map((u) => u.id)]);
}

// Live comments in a circle matching `where`, by anyone the viewer can see other than themself, and not
// replies under a comment they can't see.
export async function visibleComments(viewerId: string, buddyReadId: string, where: Prisma.BuddyReadCommentWhereInput): Promise<number> {
  const rows = await prisma.buddyReadComment.findMany({
    // AND, so a caller's own OR can't replace the "not deleted" one.
    where: { buddyReadId, userId: { not: viewerId }, AND: [liveComment, where] },
    select: { userId: true, parent: { select: { userId: true } } },
  });
  const hidden = await hiddenWriters(viewerId, rows.flatMap((r) => (r.parent ? [r.userId, r.parent.userId] : [r.userId])));
  return rows.filter((r) => !hidden.has(r.userId) && !(r.parent && hidden.has(r.parent.userId))).length;
}

// Other members on the viewer's track who finished the book since `since`.
export async function visibleFinishers(viewerId: string, buddyReadId: string, since: Date): Promise<number> {
  const rows = await prisma.buddyReadMember.findMany({
    where: { buddyReadId, userId: { not: viewerId }, finishedAt: { gte: since } },
    select: { userId: true },
  });
  const blocked = await blockedAmong(viewerId, others(viewerId, rows.map((r) => r.userId)));
  return rows.filter((r) => !blocked.has(r.userId)).length;
}
