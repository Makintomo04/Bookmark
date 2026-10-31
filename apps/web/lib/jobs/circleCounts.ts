import prisma from "@/lib/db";
import { blockedAmong } from "@/lib/buddyReadsServer";
import { notSuspendedWhere } from "@/lib/privacy";
import type { Prisma } from "@prisma/client";

// Counts of what's happening in a circle, for the checkpoint push and the weekly email, by the circle
// page's own rules (lib/buddyReadsServer.ts loadBuddyReadView): a blocked reader's comments and
// membership drop out, and so does a suspended writer's, until it ends. Counts only, never words.

// MongoDB: a soft-deleted comment has deletedAt set; most never had the field.
const liveComment = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } satisfies Prisma.BuddyReadCommentWhereInput;

// Of these people, the ones this viewer doesn't see in a circle: blocked either way, or suspended.
async function hiddenFrom(viewerId: string, ids: string[]): Promise<Set<string>> {
  const others = Array.from(new Set(ids.filter((id) => id !== viewerId)));
  if (others.length === 0) return new Set();
  const [blocked, suspended] = await Promise.all([
    blockedAmong(viewerId, others),
    prisma.user.findMany({ where: { id: { in: others }, NOT: notSuspendedWhere() }, select: { id: true } }),
  ]);
  return new Set([...blocked, ...suspended.map((u) => u.id)]);
}

// Live comments in a circle matching `where`, by anyone the viewer can see other than themself.
export async function visibleComments(viewerId: string, buddyReadId: string, where: Prisma.BuddyReadCommentWhereInput): Promise<number> {
  const rows = await prisma.buddyReadComment.findMany({
    where: { buddyReadId, userId: { not: viewerId }, ...liveComment, ...where },
    select: { userId: true },
  });
  const hidden = await hiddenFrom(viewerId, rows.map((r) => r.userId));
  return rows.filter((r) => !hidden.has(r.userId)).length;
}

// Other members the viewer can see who finished the book since `since`.
export async function visibleFinishers(viewerId: string, buddyReadId: string, since: Date): Promise<number> {
  const rows = await prisma.buddyReadMember.findMany({
    where: { buddyReadId, userId: { not: viewerId }, finishedAt: { gte: since } },
    select: { userId: true },
  });
  const hidden = await hiddenFrom(viewerId, rows.map((r) => r.userId));
  return rows.filter((r) => !hidden.has(r.userId)).length;
}
