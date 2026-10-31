import prisma from "@/lib/db";
import { stillTakenDown } from "@/lib/staffReportRules";

// A reader's record with the staff tools: how many of their reviews, lists and circle comments have been
// reported, how many of those are taken down, and their suspensions. Shown on report cards and the
// reader's card. Five queries for any number of readers.
//
// Taken down means it still is (stillTakenDown): a review put back up or a list un-hidden was a call the
// team reversed, so it no longer counts against them.
export interface TrackRecord {
  reported: number;
  takenDown: number;
  suspensions: number;
  lastSuspendedAt: string | null;
}

export async function trackRecords(userIds: string[]): Promise<Map<string, TrackRecord>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  const records = new Map<string, TrackRecord>(ids.map((id) => [id, { reported: 0, takenDown: 0, suspensions: 0, lastSuspendedAt: null }]));
  if (ids.length === 0) return records;

  const [reviews, lists, comments, suspensions] = await Promise.all([
    prisma.reviewReport.findMany({ where: { reviewerId: { in: ids } }, select: { reviewerId: true, bookId: true, status: true } }),
    prisma.listReport.findMany({ where: { list: { ownerId: { in: ids } } }, select: { listId: true, status: true, list: { select: { ownerId: true, hidden: true } } } }),
    prisma.buddyReadCommentReport.findMany({ where: { comment: { is: { userId: { in: ids } } } }, select: { commentId: true, status: true, comment: { select: { userId: true } } } }),
    prisma.staffAction.findMany({ where: { action: "user.suspend", targetType: "user", targetId: { in: ids } }, select: { targetId: true, createdAt: true } }),
  ]);
  // The actioned reviews' copies as they are now: still hidden, or put back up.
  const actioned = Array.from(new Set(reviews.filter((r) => r.status === "ACTIONED").map((r) => r.bookId)));
  const hiddenNow = new Map(actioned.length
    ? (await prisma.book.findMany({ where: { id: { in: actioned } }, select: { id: true, reviewHiddenAt: true } })).map((b) => [b.id, !!b.reviewHiddenAt])
    : []);

  // One entry per reported item: its author, and whether it's still taken down.
  const items = new Map<string, { authorId: string; takenDown: boolean }>();
  const add = (key: string, authorId: string, takenDown: boolean) => {
    const item = items.get(key);
    items.set(key, { authorId, takenDown: takenDown || !!item?.takenDown });
  };
  for (const r of reviews) add(`review:${r.bookId}`, r.reviewerId, stillTakenDown("review", { actioned: r.status === "ACTIONED", hiddenNow: hiddenNow.get(r.bookId) }));
  for (const r of lists) add(`list:${r.listId}`, r.list.ownerId, stillTakenDown("list", { actioned: r.status === "ACTIONED", hiddenNow: r.list.hidden }));
  for (const r of comments) add(`comment:${r.commentId}`, r.comment.userId, stillTakenDown("comment", { actioned: r.status === "ACTIONED" }));

  items.forEach(({ authorId, takenDown }) => {
    const record = records.get(authorId);
    if (!record) return;
    record.reported++;
    if (takenDown) record.takenDown++;
  });
  for (const s of suspensions) {
    const record = records.get(s.targetId);
    if (!record) continue;
    record.suspensions++;
    const at = s.createdAt.toISOString();
    if (!record.lastSuspendedAt || at > record.lastSuspendedAt) record.lastSuspendedAt = at;
  }
  return records;
}
