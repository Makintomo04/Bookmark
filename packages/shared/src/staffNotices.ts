import { isRole, type Role } from "./roles";
import { ROLE_WELCOME } from "./roleWelcome";

// The words for the staff-side notifications (apps/web/lib/staffNotify.ts), shared by the web's bell, the
// app's notifications screen and pushes. Readers are never told which librarian or admin did something,
// as with a hidden review.

export const STAFF_NOTICE_TYPES = ["STAFF_REPORT", "STAFF_ESCALATION", "ESCALATION_RESOLVED", "REVIEW_RESTORED", "ROLE_CHANGED"] as const;
export type StaffNoticeType = (typeof STAFF_NOTICE_TYPES)[number];
export const isStaffNotice = (type: string): type is StaffNoticeType => (STAFF_NOTICE_TYPES as readonly string[]).includes(type);

export type ReportedKind = "review" | "list" | "comment" | "book";
export type EscalationOutcome = "ACTIONED" | "DISMISSED";

const KIND_NOUNS: Record<ReportedKind, string> = { review: "a review", list: "a list", comment: "a reading-circle comment", book: "a book report" };
const kindNoun = (kind: string | undefined) => KIND_NOUNS[kind as ReportedKind] ?? "a report";

// ESCALATION_RESOLVED keeps its kind and outcome in the notification's message, as "<kind>:<outcome>".
export const escalationMessage = (kind: ReportedKind, outcome: EscalationOutcome) => `${kind}:${outcome}`;
export function parseEscalationMessage(message: string | null | undefined): { kind: string | undefined; outcome: string | undefined } {
  const [kind, outcome] = (message ?? "").split(":");
  return { kind: kind || undefined, outcome: outcome || undefined };
}

export const staffReportText = (count: number | null | undefined) => {
  const n = Math.max(1, count ?? 1);
  return `${n === 1 ? "A report is" : `${n} reports are`} waiting in the staff queue`;
};

// After the librarian's name.
export const escalationCopy = (kind: string | null | undefined) => `passed ${kindNoun(kind ?? undefined)} to admins`;

export function escalationResolvedText(message: string | null | undefined) {
  const { kind, outcome } = parseEscalationMessage(message);
  const noun = kindNoun(kind);
  return outcome === "DISMISSED"
    ? `An admin closed ${noun} you escalated without acting on it`
    : `An admin acted on ${noun} you escalated`;
}

export const reviewRestoredText = (bookTitle: string | null | undefined) =>
  `We've put your review of ${bookTitle || "a book"} back up. Everyone who could see it before can see it again.`;

// ROLE_CHANGED keeps the new role in its message.
export const roleChangedTo = (message: string | null | undefined): Role => (isRole(message) ? message : "READER");

export function roleChangedText(message: string | null | undefined) {
  const role = roleChangedTo(message);
  if (role === "READER") return "You're a reader again. Thank you for all your help looking after Bookmark.";
  const welcome = ROLE_WELCOME[role];
  return `${welcome.title}. ${welcome.lede}`;
}

// The page a staff notification opens on the web, or null to leave it to the caller.
export function staffNoticeWebPath(type: string, message: string | null | undefined): string | null {
  if (type === "STAFF_REPORT") return "/staff/reports";
  if (type === "STAFF_ESCALATION") return "/staff/reports?view=escalated";
  if (type === "ESCALATION_RESOLVED") return "/staff/reports?view=closed";
  if (type === "ROLE_CHANGED") return roleChangedTo(message) === "READER" ? null : "/staff";
  return null;
}
