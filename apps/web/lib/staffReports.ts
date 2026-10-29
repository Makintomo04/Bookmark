import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { logStaffAction } from "@/lib/staffLog";
import { staffFail, type StaffOutcome } from "@/lib/staffRoute";
import { isObjectId } from "@/lib/staffUsers";
import { createNotification } from "@/lib/notifications";
import { bookHref } from "@/lib/workKey";
import { hasPage } from "@/lib/workPages";
import { workIdForOpenLibraryKey } from "@/lib/catalog/prismaStore";
import { sharedBookWhere } from "@/lib/privacy";
import { can, roleOf } from "@/lib/roles";
import { trackRecords, type TrackRecord } from "@/lib/staffTrackRecord";
import { notifyAdminsOfEscalation, notifyEscalationResolved, notifyReviewRestored, refreshStaffReportNotices } from "@/lib/staffNotify";
import {
  actionAllowed, adminTookDown, editionLabel, mayActOnReport, mayReverseTakedown, REPORT_KINDS, REPORTED_ITEM_FIELD, takedownLockReason,
  type ReportAction, type ReportKind, type ReportStatus, type ReportView, type Takedown, type TakedownTrail,
} from "@/lib/staffReportRules";

export * from "@/lib/staffReportRules";

// The reports queue on /staff/reports. Readers report lists, reading-circle comments, reviews and wrong
// book details; each report is a row (ListReport, BuddyReadCommentReport, ReviewReport, BookReport). The queue groups them by
// what was reported, so ten reports of one list are one entry, and an action resolves them all.
// The statuses are in lib/staffReportRules.ts.

export const BOOK_REPORT_REASONS = {
  cover: "Wrong or missing cover",
  details: "Wrong title, author or pages",
  other: "Something else",
  // A reader asking for their hand-typed book to get a page (lib/workPages.ts), not a problem as such.
  catalogue: "Asked to add it to the catalogue",
} as const;
export type BookReportReason = keyof typeof BOOK_REPORT_REASONS;
export const BOOK_REPORT_NOTE_MAX = 500;

// Still waiting is OPEN and ESCALATED; "open" and unset both count, since rows from before the queue
// have no status at all.
const statusWhere = (view: "queue" | "closed") =>
  view === "queue"
    ? { OR: [{ status: { isSet: false } }, { status: null }, { status: { in: ["OPEN", "ESCALATED"] } }] }
    : { status: { in: ["ACTIONED", "DISMISSED"] } };

// Reports still waiting on someone. lib/genreLists.ts keeps a list with one out of the automatic picks.
export const openReportWhere = statusWhere("queue");
export const closedReportWhere = statusWhere("closed");

// Who passed it on or closed it, when, and their note.
export interface ReportTrail {
  by: string | null;
  at: string | null;
  note: string | null;
}

export interface QueueEntry {
  kind: ReportKind;
  // What was reported: the list, comment or work id, or for a review the reviewer's copy (Book) id.
  itemId: string;
  title: string;
  excerpt: string | null;
  // Where to see it on the site.
  path: string | null;
  authorId: string | null;
  authorUsername: string | null;
  // Already taken down (a hidden list, a deleted comment, a hidden review).
  removed: boolean;
  // A review that's still there and hidden, so it can be put back up.
  restorable: boolean;
  reasons: Record<string, number>;
  notes: string[];
  // Book reports: the editions readers were looking at.
  editions: string[];
  reportCount: number;
  firstReportedAt: string;
  lastReportedAt: string;
  status: ReportStatus;
  escalation: ReportTrail | null;
  // On closed entries: the decision.
  resolution: ReportTrail | null;
  // Whether it ever went to an admin, or an admin took it down: then only an admin puts it back up.
  takedown: TakedownTrail;
  // The author's record (lib/staffTrackRecord.ts); null for book reports.
  trackRecord: TrackRecord | null;
}

type Row = {
  reason: string; createdAt: Date; status: string | null; note?: string | null;
  escalatedById: string | null; escalatedAt: Date | null; escalationNote: string | null;
  resolvedById: string | null; resolvedAt: Date | null; resolutionNote: string | null;
};

const TRAIL = { status: true, escalatedById: true, escalatedAt: true, escalationNote: true, resolvedById: true, resolvedAt: true, resolutionNote: true } as const;

const latest = (rows: Row[], at: (r: Row) => Date | null) =>
  rows.reduce<Row | null>((best, r) => (at(r) && (!best || at(r)!.getTime() > at(best)!.getTime()) ? r : best), null);

function summarise(rows: Row[], usernameOf: Map<string, string | null>, adminIds: Set<string>, logged: Takedown[] = []) {
  const reasons: Record<string, number> = {};
  for (const r of rows) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  const times = rows.map((r) => r.createdAt.getTime());
  const name = (id: string | null) => (id ? usernameOf.get(id) ?? null : null);

  // Escalations from before the hand-off fields kept the librarian's note in resolutionNote.
  const escalated = latest(rows, (r) => r.escalatedAt) ?? rows.find((r) => r.status === "ESCALATED") ?? null;
  const resolved = latest(rows, (r) => r.resolvedAt);
  const closed = resolved && (resolved.status === "ACTIONED" || resolved.status === "DISMISSED");
  const status = (closed ? resolved.status : rows.some((r) => r.status === "ESCALATED") ? "ESCALATED" : "OPEN") as ReportStatus;
  return {
    reasons,
    notes: rows.map((r) => r.note?.trim()).filter((n): n is string => !!n).slice(0, 5),
    reportCount: rows.length,
    firstReportedAt: new Date(Math.min(...times)).toISOString(),
    lastReportedAt: new Date(Math.max(...times)).toISOString(),
    status,
    escalation: status !== "OPEN" && escalated ? {
      by: name(escalated.escalatedById),
      at: escalated.escalatedAt?.toISOString() ?? null,
      note: escalated.escalatedAt ? escalated.escalationNote : escalated.resolutionNote,
    } : null,
    resolution: closed ? { by: name(resolved.resolvedById), at: resolved.resolvedAt!.toISOString(), note: resolved.resolutionNote } : null,
    takedown: takedownOf(rows, logged, adminIds),
  };
}

type TrailRow = { status: string | null; escalatedAt: Date | null; resolvedById: string | null };

// The log entries that take something down. Each now keeps the actor's role at the time (after.byRole).
const TAKEDOWN_ACTIONS = ["report.hide", "report.hide_rating", "list.hide"];

// Each item's take-downs as logged, by item id. For a list that takes in a hide straight from its editor
// (no report).
async function loggedTakedowns(kind: ReportKind, itemIds: string[]): Promise<Map<string, Takedown[]>> {
  const out = new Map<string, Takedown[]>();
  if (kind === "book" || itemIds.length === 0) return out;
  const rows = await prisma.staffAction.findMany({
    where: { targetType: kind, targetId: { in: itemIds }, action: { in: TAKEDOWN_ACTIONS } },
    select: { targetId: true, actorId: true, after: true },
  });
  for (const r of rows) {
    const after = r.after as { byRole?: unknown } | null;
    out.set(r.targetId, [...(out.get(r.targetId) ?? []), { actorId: r.actorId, byRole: after?.byRole }]);
  }
  return out;
}

// A report row closed as ACTIONED with no take-down logged by the same person counts as theirs too,
// judged by their role now.
const takedownOf = (rows: TrailRow[], logged: Takedown[], adminIds: Set<string>): TakedownTrail => {
  const unlogged = rows
    .filter((r) => r.status === "ACTIONED" && !!r.resolvedById && !logged.some((t) => t.actorId === r.resolvedById))
    .map((r) => ({ actorId: r.resolvedById! }));
  return {
    everEscalated: rows.some((r) => r.status === "ESCALATED" || !!r.escalatedAt),
    takenDownByAdmin: adminTookDown([...logged, ...unlogged], adminIds),
  };
};

const adminsAmong = async (ids: string[]) => new Set(
  (await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true, isStaff: true } }))
    .filter((u) => can(u, "users.suspend")).map((u) => u.id),
);

// The whole item's takedown trail, closed reports and all.
export async function takedownTrail(kind: ReportKind, itemId: string): Promise<TakedownTrail> {
  const [rows, logs] = await Promise.all([
    reportRows(kind).findMany({ where: { [REPORTED_ITEM_FIELD[kind]]: itemId }, select: { status: true, escalatedAt: true, resolvedById: true } }) as Promise<TrailRow[]>,
    loggedTakedowns(kind, [itemId]),
  ]);
  const logged = logs.get(itemId) ?? [];
  const deciders = rows.map((r) => r.resolvedById).filter((id): id is string => !!id);
  return takedownOf(rows, logged, await adminsAmong([...deciders, ...logged.map((t) => t.actorId)]));
}

// For routes that put something back up: null when this person may, otherwise why not.
export async function reverseTakedownRefusal(actor: Actor, kind: ReportKind, itemId: string): Promise<string | null> {
  const trail = await takedownTrail(kind, itemId);
  return mayReverseTakedown(actor, trail) ? null : takedownLockReason(trail);
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  return groups;
}

// The four report tables behind one shape, for the queries that only need the reported item's id.
type ReportRows = {
  findMany(args: { where: object; select: object; distinct?: string[]; orderBy?: object; take?: number }): Promise<Record<string, unknown>[]>;
  findFirst(args: { where: object; select: object; orderBy?: object }): Promise<Record<string, unknown> | null>;
  updateMany(args: { where: object; data: object }): Promise<{ count: number }>;
};
export const reportRows = (kind: ReportKind) =>
  ({ list: prisma.listReport, comment: prisma.buddyReadCommentReport, review: prisma.reviewReport, book: prisma.bookReport })[kind] as unknown as ReportRows;

// Every item with an escalated report, by kind. Never capped: an escalation mustn't drop off the queue.
export async function escalatedItemIds(): Promise<Record<ReportKind, string[]>> {
  const ids = await Promise.all(REPORT_KINDS.map(async (kind) => {
    const field = REPORTED_ITEM_FIELD[kind];
    const rows = await reportRows(kind).findMany({ where: { status: "ESCALATED" }, select: { [field]: true }, distinct: [field] });
    return rows.map((r) => r[field] as string);
  }));
  return Object.fromEntries(REPORT_KINDS.map((kind, i) => [kind, ids[i]])) as Record<ReportKind, string[]>;
}

const LIMIT = 200;

export async function reportQueue(view: ReportView = "open"): Promise<QueueEntry[]> {
  const escalatedIds = view === "closed" ? null : await escalatedItemIds();
  // Open: waiting, minus anything escalated. Escalated: every waiting report of an escalated item, uncapped.
  const where = (kind: ReportKind): object => {
    if (!escalatedIds) return closedReportWhere;
    const field = REPORTED_ITEM_FIELD[kind];
    const ids = escalatedIds[kind];
    if (view === "escalated") return { ...openReportWhere, [field]: { in: ids } };
    return ids.length ? { ...openReportWhere, [field]: { notIn: ids } } : openReportWhere;
  };
  const take = view === "escalated" ? undefined : LIMIT;
  const [lists, comments, reviews, books] = await Promise.all([
    prisma.listReport.findMany({
      where: where("list"), orderBy: { createdAt: "desc" }, take,
      select: { reason: true, createdAt: true, ...TRAIL, list: { select: { id: true, title: true, description: true, hidden: true, owner: { select: { id: true, username: true } } } } },
    }),
    prisma.buddyReadCommentReport.findMany({
      where: where("comment"), orderBy: { createdAt: "desc" }, take,
      select: { reason: true, createdAt: true, ...TRAIL, comment: { select: { id: true, body: true, deletedAt: true, userId: true, buddyReadId: true } } },
    }),
    prisma.reviewReport.findMany({
      where: where("review"), orderBy: { createdAt: "desc" }, take,
      select: { bookId: true, reviewerId: true, reason: true, note: true, excerpt: true, createdAt: true, ...TRAIL },
    }),
    prisma.bookReport.findMany({
      where: where("book"), orderBy: { createdAt: "desc" }, take,
      select: { reason: true, note: true, createdAt: true, ...TRAIL, workId: true, editionId: true },
    }),
  ]);

  // Who took each item down, as logged (takedownTrail).
  const [listHides, commentHides, reviewHides] = await Promise.all([
    loggedTakedowns("list", Array.from(new Set(lists.map((l) => l.list.id)))),
    loggedTakedowns("comment", Array.from(new Set(comments.map((c) => c.comment.id)))),
    loggedTakedowns("review", Array.from(new Set(reviews.map((r) => r.bookId)))),
  ]);
  const hiders = [listHides, commentHides, reviewHides].flatMap((m) => Array.from(m.values()).flat().map((t) => t.actorId));

  // Authors, and the staff who escalated, closed or took things down.
  const all: Row[] = [...lists, ...comments, ...reviews, ...books];
  const people = await prisma.user.findMany({
    where: { id: { in: Array.from(new Set([
      ...comments.map((c) => c.comment.userId), ...reviews.map((r) => r.reviewerId), ...hiders,
      ...all.flatMap((r) => [r.escalatedById, r.resolvedById]).filter((id): id is string => !!id),
    ])) } },
    select: { id: true, username: true, role: true, isStaff: true },
  });
  const usernameOf = new Map(people.map((u) => [u.id, u.username]));
  const adminIds = new Set(people.filter((u) => can(u, "users.suspend")).map((u) => u.id));
  const records = await trackRecords([
    ...lists.map((l) => l.list.owner.id), ...comments.map((c) => c.comment.userId), ...reviews.map((r) => r.reviewerId),
  ]);
  const works = await prisma.work.findMany({
    where: { id: { in: Array.from(new Set(books.map((b) => b.workId))) } },
    select: { id: true, title: true, authors: true, openLibraryKey: true },
  });
  const workOf = new Map(works.map((w) => [w.id, w]));
  const editions = await prisma.edition.findMany({
    where: { id: { in: Array.from(new Set(books.map((b) => b.editionId).filter((id): id is string => !!id))) } },
    select: { id: true, format: true, isbn13: true, isbn10: true, publishedYear: true, publisher: true },
  });
  const editionOf = new Map(editions.map((e) => [e.id, editionLabel(e)]));
  // The reviewers' copies as they are now: the live text (it may have been edited), and whether it's hidden.
  const reviewedCopies = await prisma.book.findMany({
    where: { id: { in: Array.from(new Set(reviews.map((r) => r.bookId))) } },
    select: { id: true, title: true, workKey: true, workId: true, review: true, reviewHiddenAt: true, ratingHiddenAt: true },
  });
  const copyOf = new Map(reviewedCopies.map((b) => [b.id, b]));

  const entries: QueueEntry[] = [];
  groupBy(lists, (r) => r.list.id).forEach((rows) => {
    const list = rows[0].list;
    entries.push({
      kind: "list", itemId: list.id, title: list.title, excerpt: list.description, path: `/lists/${list.id}`,
      authorId: list.owner.id, authorUsername: list.owner.username, removed: list.hidden, restorable: false, editions: [],
      trackRecord: records.get(list.owner.id) ?? null,
      ...summarise(rows, usernameOf, adminIds, listHides.get(list.id)),
    });
  });
  groupBy(comments, (r) => r.comment.id).forEach((rows) => {
    const comment = rows[0].comment;
    entries.push({
      // No link: circles are members-only. The card shows the comment in its thread instead (commentThread).
      kind: "comment", itemId: comment.id, title: "Reading-circle comment", excerpt: comment.deletedAt ? null : comment.body,
      path: null, authorId: comment.userId, authorUsername: usernameOf.get(comment.userId) ?? null,
      removed: !!comment.deletedAt, restorable: false, editions: [], trackRecord: records.get(comment.userId) ?? null,
      ...summarise(rows, usernameOf, adminIds, commentHides.get(comment.id)),
    });
  });
  groupBy(reviews, (r) => r.bookId).forEach((rows, bookId) => {
    const copy = copyOf.get(bookId);
    const reviewerId = rows[0].reviewerId;
    const href = copy ? bookHref({ workKey: copy.workKey, pageWorkId: copy.workId, title: copy.title }) : null;
    entries.push({
      kind: "review", itemId: bookId, title: copy ? `Review of ${copy.title}` : "A review whose book is no longer on the shelf",
      // As it reads now; once hidden (or gone), as it read when first reported.
      excerpt: copy?.review && !copy.reviewHiddenAt ? copy.review : rows[rows.length - 1].excerpt,
      path: href ? `${href}#reviews-heading` : null, authorId: reviewerId, authorUsername: usernameOf.get(reviewerId) ?? null,
      removed: !copy || !!copy.reviewHiddenAt, restorable: !!copy && !!(copy.reviewHiddenAt || copy.ratingHiddenAt), editions: [],
      trackRecord: records.get(reviewerId) ?? null,
      ...summarise(rows, usernameOf, adminIds, reviewHides.get(bookId)),
    });
  });
  groupBy(books, (r) => r.workId).forEach((rows, workId) => {
    const work = workOf.get(workId);
    entries.push({
      kind: "book", itemId: workId, title: work ? `${work.title}${work.authors[0] ? ` by ${work.authors[0]}` : ""}` : "A book no longer in the catalogue",
      excerpt: null, path: `/staff/catalogue?work=${workId}`, authorId: null, authorUsername: null, removed: false, restorable: false, trackRecord: null,
      editions: Array.from(new Set(rows.map((r) => (r.editionId ? editionOf.get(r.editionId) : null)).filter((l): l is string => !!l))),
      ...summarise(rows.map((r) => ({ ...r, reason: BOOK_REPORT_REASONS[r.reason as BookReportReason] ?? r.reason })), usernameOf, adminIds),
    });
  });
  // Closed: the latest decisions first. Waiting: the most reported, then the newest.
  return entries.sort((a, b) => view === "closed"
    ? (b.resolution?.at ?? "").localeCompare(a.resolution?.at ?? "")
    : b.reportCount - a.reportCount || b.lastReportedAt.localeCompare(a.lastReportedAt));
}

const statusFor: Record<ReportAction, ReportStatus> = { dismiss: "DISMISSED", hide: "ACTIONED", hide_rating: "ACTIONED", resolve: "ACTIONED", escalate: "ESCALATED" };

async function closeReports(kind: ReportKind, itemId: string, data: Prisma.ListReportUpdateManyMutationInput) {
  return (await reportRows(kind).updateMany({ where: { [REPORTED_ITEM_FIELD[kind]]: itemId, ...openReportWhere }, data })).count;
}

// ESCALATED while any of the item's reports is.
async function itemStatus(kind: ReportKind, itemId: string): Promise<ReportStatus> {
  const escalated = await reportRows(kind).findFirst({ where: { [REPORTED_ITEM_FIELD[kind]]: itemId, status: "ESCALATED" }, select: { id: true } });
  return escalated ? "ESCALATED" : "OPEN";
}

type Actor = { id: string; role?: string | null; isStaff?: boolean | null };

export async function actOnReport(actor: Actor, kind: ReportKind, itemId: string, action: ReportAction, note?: string): Promise<StaffOutcome<{ closed: number }>> {
  if (!isObjectId(itemId)) return staffFail(404, "Nothing reported with that id.");
  if (!actionAllowed(kind, action)) return staffFail(400, "That action doesn't apply here.");
  const current = await itemStatus(kind, itemId);
  if (!mayActOnReport(actor, current, action)) {
    return action === "escalate" && current === "ESCALATED" ? staffFail(400, "That's already with an admin.") : staffFail(403, "This one's waiting for an admin.");
  }
  const cleanNote = note?.trim().slice(0, 500) || null;
  // Closing an escalated item: the librarians who passed it on hear what the admin decided.
  const escalators = current === "ESCALATED" && action !== "escalate"
    ? (await reportRows(kind).findMany({ where: { [REPORTED_ITEM_FIELD[kind]]: itemId, status: "ESCALATED" }, select: { escalatedById: true } }))
      .map((r) => r.escalatedById as string | null).filter((id): id is string => !!id)
    : [];

  let before: Prisma.InputJsonValue | undefined;
  if (action === "hide" && kind === "list") {
    const list = await prisma.list.findUnique({ where: { id: itemId }, select: { hidden: true } });
    if (!list) return staffFail(404, "That list no longer exists.");
    await prisma.list.update({ where: { id: itemId }, data: { hidden: true } });
    before = { hidden: list.hidden };
  } else if (action === "hide" && kind === "comment") {
    const comment = await prisma.buddyReadComment.findUnique({ where: { id: itemId }, select: { body: true, deletedAt: true } });
    if (!comment) return staffFail(404, "That comment no longer exists.");
    // The circle's own soft delete: replies keep their place and the body is cleared. The log keeps the text.
    if (!comment.deletedAt) await prisma.buddyReadComment.update({ where: { id: itemId }, data: { body: "", pageLabel: null, chapterLabel: null, deletedAt: new Date() } });
    before = { body: comment.body };
  } else if ((action === "hide" || action === "hide_rating") && kind === "review") {
    const copy = await prisma.book.findUnique({ where: { id: itemId }, select: { userId: true, review: true, rating: true, reviewHiddenAt: true, ratingHiddenAt: true } });
    if (!copy) return staffFail(404, "That review no longer exists.");
    // Hidden, not deleted: the review is part of the reader's own record (their journal, stats and export).
    // The hide stays when they edit it, until staff lift it (putReviewBack).
    const now = new Date();
    await prisma.book.update({
      where: { id: itemId },
      data: { reviewHiddenAt: copy.reviewHiddenAt ?? now, ...(action === "hide_rating" && { ratingHiddenAt: copy.ratingHiddenAt ?? now }) },
    });
    before = { review: copy.review, rating: copy.rating };
    // The reviewer hears why their review went. actorId is them, so no librarian is named.
    if (!copy.reviewHiddenAt) await createNotification({ userId: copy.userId, actorId: copy.userId, type: "REVIEW_HIDDEN", bookId: itemId });
  }

  const status = statusFor[action];
  // An escalation is a hand-off, not a decision: resolutionNote stays for whoever closes it.
  const closed = await closeReports(kind, itemId, action === "escalate"
    ? { status, escalatedById: actor.id, escalatedAt: new Date(), escalationNote: cleanNote }
    : { status, resolvedById: actor.id, resolvedAt: new Date(), resolutionNote: cleanNote });
  // A take-down keeps the actor's role then, so "taken down by an admin" stays true to the time
  // (takedownTrail), whatever their role becomes.
  await logStaffAction({
    actorId: actor.id, action: `report.${action}`, targetType: kind === "book" ? "work" : kind, targetId: itemId,
    before, after: { status, reports: closed, ...(status === "ACTIONED" && { byRole: roleOf(actor) }) }, reason: cleanNote,
  });
  // Awaited, so a serverless host doesn't cut them off; none of them throws.
  if (action === "escalate") await notifyAdminsOfEscalation(kind, itemId, actor.id);
  await Promise.all(Array.from(new Set(escalators)).filter((id) => id !== actor.id)
    .map((id) => notifyEscalationResolved(id, kind, itemId, status as "ACTIONED" | "DISMISSED")));
  // Whatever was closed or passed on, the bell's "N reports waiting" follows.
  await refreshStaffReportNotices();
  return { ok: true, value: { closed } };
}

// Lifts a hide on a reported review, text and rating both, from the closed tab. The reports stay closed.
// Admin-only once it went to an admin or an admin hid it (mayReverseTakedown).
export async function putReviewBack(actor: Actor, bookId: string, note?: string): Promise<StaffOutcome<{ restored: true }>> {
  if (!isObjectId(bookId)) return staffFail(404, "Nothing reported with that id.");
  const reported = await prisma.reviewReport.findFirst({ where: { bookId, ...closedReportWhere }, select: { id: true } });
  if (!reported) return staffFail(404, "Nothing reported with that id.");
  const copy = await prisma.book.findUnique({ where: { id: bookId }, select: { userId: true, reviewHiddenAt: true, ratingHiddenAt: true } });
  if (!copy) return staffFail(404, "That review no longer exists.");
  if (!copy.reviewHiddenAt && !copy.ratingHiddenAt) return staffFail(400, "That review is already up.");
  const refusal = await reverseTakedownRefusal(actor, "review", bookId);
  if (refusal) return staffFail(403, refusal);
  await prisma.book.update({ where: { id: bookId }, data: { reviewHiddenAt: null, ratingHiddenAt: null } });
  await logStaffAction({
    actorId: actor.id, action: "report.unhide", targetType: "review", targetId: bookId,
    before: { reviewHiddenAt: copy.reviewHiddenAt?.toISOString() ?? null, ratingHiddenAt: copy.ratingHiddenAt?.toISOString() ?? null },
    after: { reviewHiddenAt: null, ratingHiddenAt: null },
    reason: note?.trim().slice(0, 500) || null,
  });
  await notifyReviewRestored(copy.userId, bookId);
  return { ok: true, value: { restored: true } };
}

// A reported circle comment in its thread, for the report card: circles are members-only, so staff see
// this instead of the circle. The spoiler lock reads staff as being at the reported comment: nothing
// further into the book shows its text.
export interface ThreadComment {
  id: string;
  authorUsername: string | null;
  body: string | null;
  deleted: boolean;
  locked: boolean;
  position: number;
  pageLabel: string | null;
  chapterLabel: string | null;
  createdAt: string;
  isReply: boolean;
  reported: boolean;
}
export interface CommentThread {
  circleTitle: string;
  comments: ThreadComment[];
}

const threadSelect = { id: true, userId: true, body: true, deletedAt: true, position: true, pageLabel: true, chapterLabel: true, createdAt: true, parentId: true } as const;
const readingOrder = [{ position: "asc" }, { createdAt: "asc" }] as const satisfies Prisma.BuddyReadCommentOrderByWithRelationInput[];

export async function commentThread(commentId: string): Promise<StaffOutcome<CommentThread>> {
  if (!isObjectId(commentId)) return staffFail(404, "Nothing reported with that id.");
  // Only a reported comment opens its thread: staff aren't members, and circles are otherwise private.
  if (!(await prisma.buddyReadCommentReport.findFirst({ where: { commentId }, select: { id: true } }))) {
    return staffFail(404, "Nothing reported with that id.");
  }
  const target = await prisma.buddyReadComment.findUnique({ where: { id: commentId }, select: { ...threadSelect, buddyReadId: true, buddyRead: { select: { title: true } } } });
  if (!target) return staffFail(404, "That comment no longer exists.");

  // Its neighbours on the same level: the parent's other replies, or the circle's other top-level comments.
  const level: Prisma.BuddyReadCommentWhereInput = target.parentId
    ? { parentId: target.parentId }
    : { buddyReadId: target.buddyReadId, OR: [{ parentId: null }, { parentId: { isSet: false } }] };
  const isBefore = (c: { position: number; createdAt: Date }) =>
    c.position < target.position || (c.position === target.position && c.createdAt < target.createdAt);
  const [earlier, later, parent, replies] = await Promise.all([
    prisma.buddyReadComment.findMany({ where: { ...level, position: { lte: target.position }, id: { not: commentId } }, orderBy: [{ position: "desc" }, { createdAt: "desc" }], take: 4, select: threadSelect }),
    prisma.buddyReadComment.findMany({ where: { ...level, position: { gte: target.position }, id: { not: commentId } }, orderBy: readingOrder, take: 4, select: threadSelect }),
    target.parentId ? prisma.buddyReadComment.findUnique({ where: { id: target.parentId }, select: threadSelect }) : null,
    target.parentId ? [] : prisma.buddyReadComment.findMany({ where: { parentId: commentId }, orderBy: readingOrder, take: 2, select: threadSelect }),
  ]);
  const before = earlier.filter(isBefore).slice(0, 2).reverse();
  const after = later.filter((c) => !isBefore(c)).slice(0, 1);

  type ThreadRow = typeof before[number];
  const all: ThreadRow[] = [...(parent ? [parent] : []), ...before, target, ...replies, ...after];
  const people = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(all.map((c) => c.userId))) } }, select: { id: true, username: true } });
  const usernameOf = new Map(people.map((u) => [u.id, u.username]));
  const shape = (c: ThreadRow): ThreadComment => {
    const locked = c.position > target.position;
    const deleted = !!c.deletedAt;
    return {
      id: c.id, authorUsername: usernameOf.get(c.userId) ?? null, body: locked || deleted ? null : c.body, deleted, locked,
      position: c.position, pageLabel: locked ? null : c.pageLabel, chapterLabel: locked ? null : c.chapterLabel,
      createdAt: c.createdAt.toISOString(), isReply: !!c.parentId, reported: c.id === commentId,
    };
  };
  return { ok: true, value: { circleTitle: target.buddyRead.title, comments: all.map(shape) } };
}

// A reader's report of a wrong cover or wrong details, or a request to add a hand-typed book. One per reader per book; reporting again updates it.
export async function reportBook(reporterId: string, body: Record<string, unknown>): Promise<StaffOutcome<{ reported: true }>> {
  // A work id, or the Open Library work key Discover and lists carry (OL45883W): a merged work's key reports
  // the book it went into.
  const workKey = typeof body.workKey === "string" && /^OL\d+W$/i.test(body.workKey) ? body.workKey.toUpperCase() : null;
  const workId = typeof body.workId === "string" ? body.workId
    : workKey ? await workIdForOpenLibraryKey(workKey) : null;
  const editionId = typeof body.editionId === "string" && isObjectId(body.editionId) ? body.editionId : null;
  const reason = body.reason as BookReportReason;
  if (!workId || !isObjectId(workId) || !(await prisma.work.findUnique({ where: { id: workId }, select: { id: true } }))) return staffFail(404, "Book not found");
  if (typeof reason !== "string" || !(reason in BOOK_REPORT_REASONS)) return staffFail(400, "Choose what's wrong.");
  if (reason === "catalogue") {
    // Only for a book that has no page yet, from a reader who has it on their shelf and shares it: a
    // private copy may be a note nobody else should see.
    const work = await prisma.work.findUnique({ where: { id: workId }, select: { openLibraryKey: true, hardcoverId: true, pageApprovedAt: true } });
    if (work && hasPage(work)) return staffFail(400, "This book is already in the catalogue.");
    const copy = await prisma.book.findFirst({ where: { workId, userId: reporterId, ...sharedBookWhere }, select: { id: true } });
    if (!copy) return staffFail(400, "Share the book on your profile first, then ask for it to be added.");
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, BOOK_REPORT_NOTE_MAX) || null : null;
  // Reporting again reopens a closed report, but leaves one with an admin where it is.
  const existing = await prisma.bookReport.findUnique({ where: { workId_reporterId: { workId, reporterId } }, select: { status: true } });
  const status = existing?.status === "ESCALATED" ? "ESCALATED" : "OPEN";
  await prisma.bookReport.upsert({
    where: { workId_reporterId: { workId, reporterId } },
    create: { workId, editionId, reporterId, reason, note, status: "OPEN" },
    update: { editionId, reason, note, status, createdAt: new Date(), resolvedAt: null, resolvedById: null, resolutionNote: null,
      ...(status === "OPEN" && { escalatedById: null, escalatedAt: null, escalationNote: null }) },
  });
  return { ok: true, value: { reported: true } };
}
