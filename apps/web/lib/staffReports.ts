import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { logStaffAction } from "@/lib/staffLog";
import { staffFail, type StaffOutcome } from "@/lib/staffRoute";
import { isObjectId } from "@/lib/staffUsers";

// The reports queue on /staff/reports. Readers report lists, reading-circle comments and wrong book
// details; each report is a row (ListReport, BuddyReadCommentReport, BookReport). The queue groups them by
// what was reported, so ten reports of one list are one entry, and an action resolves them all.
//
// Status, on every report row (unset reads as OPEN):
//   OPEN       waiting for a librarian
//   ESCALATED  a librarian passed it to an admin (a suspension, say); still in the queue
//   ACTIONED   something was done: content taken down, or the book fixed
//   DISMISSED  nothing needed doing

export const REPORT_KINDS = ["list", "comment", "book"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_STATUSES = ["OPEN", "ESCALATED", "ACTIONED", "DISMISSED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const BOOK_REPORT_REASONS = {
  cover: "Wrong or missing cover",
  details: "Wrong title, author or pages",
  other: "Something else",
} as const;
export type BookReportReason = keyof typeof BOOK_REPORT_REASONS;
export const BOOK_REPORT_NOTE_MAX = 500;

export const isReportKind = (value: unknown): value is ReportKind => typeof value === "string" && (REPORT_KINDS as readonly string[]).includes(value);

// The open queue is OPEN and ESCALATED; "open" and unset both count, since rows from before the queue
// have no status at all.
const statusWhere = (view: "queue" | "closed") =>
  view === "queue"
    ? { OR: [{ status: { isSet: false } }, { status: null }, { status: { in: ["OPEN", "ESCALATED"] } }] }
    : { status: { in: ["ACTIONED", "DISMISSED"] } };

export interface QueueEntry {
  kind: ReportKind;
  // What was reported: the list, comment or work id.
  itemId: string;
  title: string;
  excerpt: string | null;
  // Where to see it on the site.
  path: string | null;
  authorId: string | null;
  authorUsername: string | null;
  // Already taken down (a hidden list, a deleted comment).
  removed: boolean;
  reasons: Record<string, number>;
  notes: string[];
  reportCount: number;
  firstReportedAt: string;
  lastReportedAt: string;
  status: ReportStatus;
}

type Row = { reason: string; createdAt: Date; status: string | null; note?: string | null };

function summarise(rows: Row[]) {
  const reasons: Record<string, number> = {};
  for (const r of rows) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  const times = rows.map((r) => r.createdAt.getTime());
  return {
    reasons,
    notes: rows.map((r) => r.note?.trim()).filter((n): n is string => !!n).slice(0, 5),
    reportCount: rows.length,
    firstReportedAt: new Date(Math.min(...times)).toISOString(),
    lastReportedAt: new Date(Math.max(...times)).toISOString(),
    status: (rows.some((r) => r.status === "ESCALATED") ? "ESCALATED" : rows[0]?.status ?? "OPEN") as ReportStatus,
  };
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  return groups;
}

const LIMIT = 200;

export async function reportQueue(view: "queue" | "closed" = "queue"): Promise<QueueEntry[]> {
  const where = statusWhere(view);
  const [lists, comments, books] = await Promise.all([
    prisma.listReport.findMany({
      where, orderBy: { createdAt: "desc" }, take: LIMIT,
      select: { reason: true, createdAt: true, status: true, list: { select: { id: true, title: true, description: true, hidden: true, owner: { select: { id: true, username: true } } } } },
    }),
    prisma.buddyReadCommentReport.findMany({
      where, orderBy: { createdAt: "desc" }, take: LIMIT,
      select: { reason: true, createdAt: true, status: true, comment: { select: { id: true, body: true, deletedAt: true, userId: true, buddyReadId: true } } },
    }),
    prisma.bookReport.findMany({
      where, orderBy: { createdAt: "desc" }, take: LIMIT,
      select: { reason: true, note: true, createdAt: true, status: true, workId: true },
    }),
  ]);

  const commentAuthors = await prisma.user.findMany({
    where: { id: { in: Array.from(new Set(comments.map((c) => c.comment.userId))) } },
    select: { id: true, username: true },
  });
  const usernameOf = new Map(commentAuthors.map((u) => [u.id, u.username]));
  const works = await prisma.work.findMany({
    where: { id: { in: Array.from(new Set(books.map((b) => b.workId))) } },
    select: { id: true, title: true, authors: true, openLibraryKey: true },
  });
  const workOf = new Map(works.map((w) => [w.id, w]));

  const entries: QueueEntry[] = [];
  groupBy(lists, (r) => r.list.id).forEach((rows) => {
    const list = rows[0].list;
    entries.push({
      kind: "list", itemId: list.id, title: list.title, excerpt: list.description, path: `/lists/${list.id}`,
      authorId: list.owner.id, authorUsername: list.owner.username, removed: list.hidden, ...summarise(rows),
    });
  });
  groupBy(comments, (r) => r.comment.id).forEach((rows) => {
    const comment = rows[0].comment;
    entries.push({
      kind: "comment", itemId: comment.id, title: "Reading-circle comment", excerpt: comment.deletedAt ? null : comment.body,
      path: `/circles/${comment.buddyReadId}`, authorId: comment.userId, authorUsername: usernameOf.get(comment.userId) ?? null,
      removed: !!comment.deletedAt, ...summarise(rows),
    });
  });
  groupBy(books, (r) => r.workId).forEach((rows, workId) => {
    const work = workOf.get(workId);
    entries.push({
      kind: "book", itemId: workId, title: work ? `${work.title}${work.authors[0] ? ` by ${work.authors[0]}` : ""}` : "A book no longer in the catalogue",
      excerpt: null, path: `/staff/catalogue?work=${workId}`, authorId: null, authorUsername: null, removed: false,
      ...summarise(rows.map((r) => ({ ...r, reason: BOOK_REPORT_REASONS[r.reason as BookReportReason] ?? r.reason }))),
    });
  });
  // Escalated first, then the most reported, then the newest.
  return entries.sort((a, b) =>
    Number(b.status === "ESCALATED") - Number(a.status === "ESCALATED")
    || b.reportCount - a.reportCount
    || b.lastReportedAt.localeCompare(a.lastReportedAt));
}

export const REPORT_ACTIONS = ["dismiss", "hide", "resolve", "escalate"] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

// What each action may be used on: hiding is for lists and comments; "resolve" (it's been fixed) for books.
export function actionAllowed(kind: ReportKind, action: ReportAction): boolean {
  if (action === "hide") return kind !== "book";
  if (action === "resolve") return kind === "book";
  return true;
}

const statusFor: Record<ReportAction, ReportStatus> = { dismiss: "DISMISSED", hide: "ACTIONED", resolve: "ACTIONED", escalate: "ESCALATED" };

async function closeReports(kind: ReportKind, itemId: string, data: Prisma.ListReportUpdateManyMutationInput) {
  const open = statusWhere("queue");
  if (kind === "list") return (await prisma.listReport.updateMany({ where: { listId: itemId, ...open }, data })).count;
  if (kind === "comment") return (await prisma.buddyReadCommentReport.updateMany({ where: { commentId: itemId, ...open }, data })).count;
  return (await prisma.bookReport.updateMany({ where: { workId: itemId, ...open }, data })).count;
}

export async function actOnReport(actor: { id: string }, kind: ReportKind, itemId: string, action: ReportAction, note?: string): Promise<StaffOutcome<{ closed: number }>> {
  if (!isObjectId(itemId)) return staffFail(404, "Nothing reported with that id.");
  if (!actionAllowed(kind, action)) return staffFail(400, "That action doesn't apply here.");
  const cleanNote = note?.trim().slice(0, 500) || null;

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
  }

  const status = statusFor[action];
  const closed = await closeReports(kind, itemId, action === "escalate"
    ? { status, resolutionNote: cleanNote }
    : { status, resolvedById: actor.id, resolvedAt: new Date(), resolutionNote: cleanNote });
  await logStaffAction({
    actorId: actor.id, action: `report.${action}`, targetType: kind === "book" ? "work" : kind, targetId: itemId,
    before, after: { status, reports: closed }, reason: cleanNote,
  });
  return { ok: true, value: { closed } };
}

// A reader's report of a wrong cover or wrong details. One per reader per book; reporting again updates it.
export async function reportBook(reporterId: string, body: Record<string, unknown>): Promise<StaffOutcome<{ reported: true }>> {
  // A work id, or the Open Library work key Discover and lists carry (OL45883W).
  const workKey = typeof body.workKey === "string" && /^OL\d+W$/i.test(body.workKey) ? body.workKey.toUpperCase() : null;
  const workId = typeof body.workId === "string" ? body.workId
    : workKey ? (await prisma.work.findFirst({ where: { openLibraryKey: workKey }, select: { id: true } }))?.id ?? null : null;
  const editionId = typeof body.editionId === "string" && isObjectId(body.editionId) ? body.editionId : null;
  const reason = body.reason as BookReportReason;
  if (!workId || !isObjectId(workId) || !(await prisma.work.findUnique({ where: { id: workId }, select: { id: true } }))) return staffFail(404, "Book not found");
  if (typeof reason !== "string" || !(reason in BOOK_REPORT_REASONS)) return staffFail(400, "Choose what's wrong.");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, BOOK_REPORT_NOTE_MAX) || null : null;
  await prisma.bookReport.upsert({
    where: { workId_reporterId: { workId, reporterId } },
    create: { workId, editionId, reporterId, reason, note, status: "OPEN" },
    update: { editionId, reason, note, status: "OPEN", createdAt: new Date(), resolvedAt: null, resolvedById: null, resolutionNote: null },
  });
  return { ok: true, value: { reported: true } };
}
