import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { logStaffAction } from "@/lib/staffLog";
import { staffFail, type StaffOutcome } from "@/lib/staffRoute";
import { isObjectId } from "@/lib/staffUsers";
import { createNotification } from "@/lib/notifications";
import { bookHref } from "@/lib/workKey";
import { hasPage } from "@/lib/workPages";
import { sharedBookWhere } from "@/lib/privacy";
import { actionAllowed, type ReportAction, type ReportKind } from "@/lib/staffReportRules";

export * from "@/lib/staffReportRules";

// The reports queue on /staff/reports. Readers report lists, reading-circle comments, reviews and wrong
// book details; each report is a row (ListReport, BuddyReadCommentReport, ReviewReport, BookReport). The queue groups them by
// what was reported, so ten reports of one list are one entry, and an action resolves them all.
//
// Status, on every report row (unset reads as OPEN):
//   OPEN       waiting for a librarian
//   ESCALATED  a librarian passed it to an admin (a suspension, say); still in the queue
//   ACTIONED   something was done: content taken down, or the book fixed
//   DISMISSED  nothing needed doing

export const REPORT_STATUSES = ["OPEN", "ESCALATED", "ACTIONED", "DISMISSED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const BOOK_REPORT_REASONS = {
  cover: "Wrong or missing cover",
  details: "Wrong title, author or pages",
  other: "Something else",
  // A reader asking for their hand-typed book to get a page (lib/workPages.ts), not a problem as such.
  catalogue: "Asked to add it to the catalogue",
} as const;
export type BookReportReason = keyof typeof BOOK_REPORT_REASONS;
export const BOOK_REPORT_NOTE_MAX = 500;

// The open queue is OPEN and ESCALATED; "open" and unset both count, since rows from before the queue
// have no status at all.
const statusWhere = (view: "queue" | "closed") =>
  view === "queue"
    ? { OR: [{ status: { isSet: false } }, { status: null }, { status: { in: ["OPEN", "ESCALATED"] } }] }
    : { status: { in: ["ACTIONED", "DISMISSED"] } };

// Reports still waiting on someone. lib/genreLists.ts keeps a list with one out of the automatic picks.
export const openReportWhere = statusWhere("queue");

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
  const [lists, comments, reviews, books] = await Promise.all([
    prisma.listReport.findMany({
      where, orderBy: { createdAt: "desc" }, take: LIMIT,
      select: { reason: true, createdAt: true, status: true, list: { select: { id: true, title: true, description: true, hidden: true, owner: { select: { id: true, username: true } } } } },
    }),
    prisma.buddyReadCommentReport.findMany({
      where, orderBy: { createdAt: "desc" }, take: LIMIT,
      select: { reason: true, createdAt: true, status: true, comment: { select: { id: true, body: true, deletedAt: true, userId: true, buddyReadId: true } } },
    }),
    prisma.reviewReport.findMany({
      where, orderBy: { createdAt: "desc" }, take: LIMIT,
      select: { bookId: true, reviewerId: true, reason: true, note: true, excerpt: true, createdAt: true, status: true },
    }),
    prisma.bookReport.findMany({
      where, orderBy: { createdAt: "desc" }, take: LIMIT,
      select: { reason: true, note: true, createdAt: true, status: true, workId: true },
    }),
  ]);

  const commentAuthors = await prisma.user.findMany({
    where: { id: { in: Array.from(new Set([...comments.map((c) => c.comment.userId), ...reviews.map((r) => r.reviewerId)])) } },
    select: { id: true, username: true },
  });
  const usernameOf = new Map(commentAuthors.map((u) => [u.id, u.username]));
  const works = await prisma.work.findMany({
    where: { id: { in: Array.from(new Set(books.map((b) => b.workId))) } },
    select: { id: true, title: true, authors: true, openLibraryKey: true },
  });
  const workOf = new Map(works.map((w) => [w.id, w]));
  // The reviewers' copies as they are now: the live text (it may have been edited), and whether it's hidden.
  const reviewedCopies = await prisma.book.findMany({
    where: { id: { in: Array.from(new Set(reviews.map((r) => r.bookId))) } },
    select: { id: true, title: true, workKey: true, workId: true, review: true, reviewHiddenAt: true },
  });
  const copyOf = new Map(reviewedCopies.map((b) => [b.id, b]));

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
  groupBy(reviews, (r) => r.bookId).forEach((rows, bookId) => {
    const copy = copyOf.get(bookId);
    const reviewerId = rows[0].reviewerId;
    const href = copy ? bookHref({ workKey: copy.workKey, pageWorkId: copy.workId, title: copy.title }) : null;
    entries.push({
      kind: "review", itemId: bookId, title: copy ? `Review of ${copy.title}` : "A review whose book is no longer on the shelf",
      // As it reads now; once hidden (or gone), as it read when first reported.
      excerpt: copy?.review && !copy.reviewHiddenAt ? copy.review : rows[rows.length - 1].excerpt,
      path: href ? `${href}#reviews-heading` : null, authorId: reviewerId, authorUsername: usernameOf.get(reviewerId) ?? null,
      removed: !copy || !!copy.reviewHiddenAt, ...summarise(rows),
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

const statusFor: Record<ReportAction, ReportStatus> = { dismiss: "DISMISSED", hide: "ACTIONED", hide_rating: "ACTIONED", resolve: "ACTIONED", escalate: "ESCALATED" };

async function closeReports(kind: ReportKind, itemId: string, data: Prisma.ListReportUpdateManyMutationInput) {
  const open = statusWhere("queue");
  if (kind === "list") return (await prisma.listReport.updateMany({ where: { listId: itemId, ...open }, data })).count;
  if (kind === "comment") return (await prisma.buddyReadCommentReport.updateMany({ where: { commentId: itemId, ...open }, data })).count;
  if (kind === "review") return (await prisma.reviewReport.updateMany({ where: { bookId: itemId, ...open }, data })).count;
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
  } else if ((action === "hide" || action === "hide_rating") && kind === "review") {
    const copy = await prisma.book.findUnique({ where: { id: itemId }, select: { userId: true, review: true, rating: true, reviewHiddenAt: true, ratingHiddenAt: true } });
    if (!copy) return staffFail(404, "That review no longer exists.");
    // Hidden, not deleted: the review is part of the reader's own record (their journal, stats and export).
    // The hide stays when they edit it, until staff lift it.
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
  const closed = await closeReports(kind, itemId, action === "escalate"
    ? { status, resolutionNote: cleanNote }
    : { status, resolvedById: actor.id, resolvedAt: new Date(), resolutionNote: cleanNote });
  await logStaffAction({
    actorId: actor.id, action: `report.${action}`, targetType: kind === "book" ? "work" : kind, targetId: itemId,
    before, after: { status, reports: closed }, reason: cleanNote,
  });
  return { ok: true, value: { closed } };
}

// A reader's report of a wrong cover or wrong details, or a request to add a hand-typed book. One per reader per book; reporting again updates it.
export async function reportBook(reporterId: string, body: Record<string, unknown>): Promise<StaffOutcome<{ reported: true }>> {
  // A work id, or the Open Library work key Discover and lists carry (OL45883W).
  const workKey = typeof body.workKey === "string" && /^OL\d+W$/i.test(body.workKey) ? body.workKey.toUpperCase() : null;
  const workId = typeof body.workId === "string" ? body.workId
    : workKey ? (await prisma.work.findFirst({ where: { openLibraryKey: workKey }, select: { id: true } }))?.id ?? null : null;
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
  await prisma.bookReport.upsert({
    where: { workId_reporterId: { workId, reporterId } },
    create: { workId, editionId, reporterId, reason, note, status: "OPEN" },
    update: { editionId, reason, note, status: "OPEN", createdAt: new Date(), resolvedAt: null, resolvedById: null, resolutionNote: null },
  });
  return { ok: true, value: { reported: true } };
}
