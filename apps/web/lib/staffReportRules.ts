// The reports queue's rules, apart from the database so the tests can run them under plain Node.
// lib/staffReports.ts re-exports these and does the work.
import { can, isRole } from "@/lib/roles";

export const REPORT_KINDS = ["list", "comment", "review", "book"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const isReportKind = (value: unknown): value is ReportKind => typeof value === "string" && (REPORT_KINDS as readonly string[]).includes(value);

// Status, on every report row (unset reads as OPEN):
//   OPEN       waiting for a librarian
//   ESCALATED  a librarian passed it to an admin (a suspension, say); still waiting, on its own tab
//   ACTIONED   something was done: content taken down, or the book fixed
//   DISMISSED  nothing needed doing
export const REPORT_STATUSES = ["OPEN", "ESCALATED", "ACTIONED", "DISMISSED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

// The queue's tabs. Open leaves out anything escalated, even a report that came in after the escalation:
// the whole item is the admin's until they close it.
export const REPORT_VIEWS = ["open", "escalated", "closed"] as const;
export type ReportView = (typeof REPORT_VIEWS)[number];
export const isReportView = (value: unknown): value is ReportView => typeof value === "string" && (REPORT_VIEWS as readonly string[]).includes(value);

export const REPORT_ACTIONS = ["dismiss", "hide", "hide_rating", "resolve", "escalate"] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

// The field on each report row that says what was reported.
export const REPORTED_ITEM_FIELD = { list: "listId", comment: "commentId", review: "bookId", book: "workId" } as const satisfies Record<ReportKind, string>;

// What each action may be used on: hiding is for lists, comments and reviews; hiding a review's rating as
// well is for reviews only; "resolve" (it's been fixed) for books.
export function actionAllowed(kind: ReportKind, action: ReportAction): boolean {
  if (action === "hide") return kind !== "book";
  if (action === "hide_rating") return kind === "review";
  if (action === "resolve") return kind === "book";
  return true;
}

type Staff = { role?: string | null; isStaff?: boolean | null };

// Who may act on an item in this state. Once escalated it's the admins' (anyone who can suspend): a
// librarian sees it, read-only, until one closes it. Escalating twice does nothing, so it's refused.
export function mayActOnReport(user: Staff | null | undefined, status: ReportStatus, action: ReportAction): boolean {
  if (!can(user, "reports.review")) return false;
  if (status !== "ESCALATED") return true;
  return action !== "escalate" && can(user, "users.suspend");
}

// A closed card's decision, in the console's words.
export function reportOutcome(kind: ReportKind, status: ReportStatus): string | null {
  if (status === "DISMISSED") return "Dismissed";
  if (status === "ACTIONED") return kind === "book" ? "Fixed" : "Taken down";
  return null;
}

// "Put back up": a closed review report whose review is still there and still hidden.
export function canPutBack(entry: { kind: ReportKind; status: ReportStatus; restorable: boolean }): boolean {
  return entry.kind === "review" && (entry.status === "ACTIONED" || entry.status === "DISMISSED") && entry.restorable;
}

// Who took an item down, and whether it ever went to an admin: from its report rows (and, for a list, the
// staff log's last hide).
export interface TakedownTrail {
  everEscalated: boolean;
  takenDownByAdmin: boolean;
}

// One take-down of an item, from the staff log (report.hide, report.hide_rating, list.hide) or a report
// row closed as ACTIONED: who did it and, from the log, the role they had then (after.byRole).
export type Takedown = { actorId: string; byRole?: unknown };

// Whether an admin took it down, by the role they had at the time: a librarian later made admin didn't
// take it down as an admin, nor did an admin since stepped down stop having done so. Entries from before
// byRole was recorded fall back to the actor's role now (adminNow).
export function adminTookDown(takedowns: Takedown[], adminNow: Set<string>): boolean {
  return takedowns.some((t) => (isRole(t.byRole) ? can({ role: t.byRole }, "users.suspend") : adminNow.has(t.actorId)));
}

// Putting something back up (a review from the closed tab, a list un-hidden in its editor). An admin's
// decision stays an admin's: once an item has been escalated, or an admin took it down, only an admin
// (anyone who can suspend) reverses it.
export function mayReverseTakedown(user: Staff | null | undefined, trail: TakedownTrail): boolean {
  if (!can(user, "reports.review") && !can(user, "lists.curate")) return false;
  return !(trail.everEscalated || trail.takenDownByAdmin) || can(user, "users.suspend");
}

// Why the put-back button isn't there, for those who can't.
export const takedownLockReason = (trail: TakedownTrail) =>
  trail.takenDownByAdmin ? "An admin took this down, so only an admin can put it back up." : "This went to an admin, so only an admin can put it back up.";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

// Whether a reported item still counts against its author (lib/staffTrackRecord.ts): taken down and not put
// back. A review counts while it's hidden (hiddenNow; undefined when the reader has since deleted it, which
// still counts); a list while it's hidden, by a report or from its editor; a comment once actioned, since
// a deleted comment can't come back.
export function stillTakenDown(kind: "review" | "list" | "comment", item: { actioned: boolean; hiddenNow?: boolean }): boolean {
  if (kind === "list") return !!item.hiddenNow;
  if (kind === "review") return item.actioned && item.hiddenNow !== false;
  return item.actioned;
}

// The author's record on a report card: "Reported 3 times before (1 upheld) · suspended once (12 Sep)",
// or "First report about @x". This item counts as neither reported before nor (if it's been actioned) taken down before.
export function trackRecordLine(
  record: { reported: number; takenDown: number; suspensions: number; lastSuspendedAt: string | null },
  item: { actioned: boolean },
  username: string | null,
  now = new Date(),
): string {
  const before = Math.max(0, record.reported - 1);
  const takenDown = Math.max(0, record.takenDown - (item.actioned ? 1 : 0));
  const parts = [before
    ? `Reported ${times(before)} before${takenDown ? ` (${takenDown} upheld)` : ""}`
    : `First report about ${username ? `@${username}` : "them"}`];
  if (record.suspensions) {
    const last = record.lastSuspendedAt ? new Date(record.lastSuspendedAt) : null;
    // Spelt out by hand: some ICU versions write September as "Sept".
    const when = last && `${last.getUTCDate()} ${MONTHS[last.getUTCMonth()]}${last.getUTCFullYear() !== now.getUTCFullYear() ? ` ${last.getUTCFullYear()}` : ""}`;
    parts.push(`suspended ${times(record.suspensions)}${when ? ` (${when})` : ""}`);
  }
  return parts.join(" · ");
}

// The count on the Staff link and the Reports tab: what's waiting on this person. Escalated items only
// count for those who can act on them.
export function waitingCount(counts: { open: number; escalated: number }, user: Staff | null | undefined): number {
  return counts.open + (can(user, "users.suspend") ? counts.escalated : 0);
}

const FORMAT_LABELS: Record<string, string> = { PAPERBACK: "Paperback", HARDCOVER: "Hardback", EBOOK: "Ebook", AUDIOBOOK: "Audiobook" };

// The edition a reader reported a book from: "Paperback · ISBN 9780441013593 · 2005", or whatever's known.
export function editionLabel(edition: { format?: string | null; isbn13?: string | null; isbn10?: string | null; publishedYear?: number | null; publisher?: string | null }): string {
  const isbn = edition.isbn13 ?? edition.isbn10;
  const parts = [
    edition.format ? FORMAT_LABELS[edition.format] ?? edition.format : null,
    edition.publisher,
    isbn ? `ISBN ${isbn}` : null,
    edition.publishedYear ? String(edition.publishedYear) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "An edition with no details";
}

// "just now", "5m ago", "2h ago", "3d ago", then the date.
export function timeAgo(iso: string, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// The overview's activity windows, in UTC: today from midnight, this week from Monday.
export function activityWindows(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const week = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86_400_000);
  return { today, week };
}
