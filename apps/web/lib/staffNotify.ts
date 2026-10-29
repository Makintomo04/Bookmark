import prisma from "@/lib/db";
import { createNotification, createNotifications } from "@/lib/notifications";
import { reportCounts } from "@/lib/staffOverview";
import { reportRows } from "@/lib/staffReports";
import { REPORTED_ITEM_FIELD } from "@/lib/staffReportRules";
import { escalationRecipients, planStaffReportNotices, planWaitingRefresh, reportRecipients } from "@/lib/staffNotifyRules";
import { escalationMessage, type EscalationOutcome, type ReportedKind } from "@bookmark/shared/staffNotices";

// The bell for the staff side of reports: librarians and admins hear a report is waiting, admins hear of
// an escalation, the librarian who escalated hears how it ended, and readers hear their review is back or
// their role changed. Readers are never told which librarian or admin it was (actorId is themselves, as
// REVIEW_HIDDEN). Words are in packages/shared/src/staffNotices.ts.
//
// None of these throw: they run after the change they're about has been saved, and a missed notification
// mustn't fail it.

// Everyone who might be staff, including accounts from before roles (isStaff).
const staffWhere = { OR: [{ role: { in: ["LIBRARIAN", "ADMIN"] } }, { isStaff: true }] };
const staffSelect = { id: true, role: true, isStaff: true, suspendedAt: true, suspendedUntil: true } as const;

const fail = (what: string) => (err: unknown) => console.error(`[staffNotify] couldn't ${what}:`, err);

// A reader filed a report. Called after it's saved; the route awaits it so a serverless host doesn't cut
// it off, and it never throws.
export async function notifyStaffOfReport(kind: ReportedKind, itemId: string): Promise<void> {
  try {
    const field = REPORTED_ITEM_FIELD[kind];
    // The newest report of the item is the one just filed.
    const [latest, staff, counts] = await Promise.all([
      reportRows(kind).findFirst({ where: { [field]: itemId }, orderBy: { createdAt: "desc" }, select: { reporterId: true } }),
      prisma.user.findMany({ where: staffWhere, select: staffSelect }),
      reportCounts(),
    ]);
    const recipients = reportRecipients(staff, (latest?.reporterId as string | undefined) ?? null);
    if (recipients.length === 0) return;
    const unread = await prisma.notification.findMany({
      where: { userId: { in: recipients.map((r) => r.id) }, type: "STAFF_REPORT", read: false },
      select: { id: true, userId: true },
    });
    const plan = planStaffReportNotices(recipients, unread, { open: counts.openTotal, escalated: counts.escalated });
    // A refreshed one moves back to the top of the bell.
    await Promise.all(plan.update.map(({ id, count }) => prisma.notification.update({ where: { id }, data: { count, createdAt: new Date() } })));
    await createNotifications(plan.create.map(({ userId, count }) => ({ userId, actorId: userId, type: "STAFF_REPORT" as const, count })));
  } catch (err) {
    fail(`tell staff about a ${kind} report`)(err);
  }
}

// Staff closed or escalated reports: each unread "reports waiting" is brought to the count waiting on its
// owner now, or marked read when nothing is. Left where it is in the bell: it's a correction, not news.
export async function refreshStaffReportNotices(): Promise<void> {
  try {
    const unread = await prisma.notification.findMany({ where: { type: "STAFF_REPORT", read: false }, select: { id: true, userId: true, count: true } });
    if (unread.length === 0) return;
    const [staff, counts] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: Array.from(new Set(unread.map((n) => n.userId))) } }, select: staffSelect }),
      reportCounts(),
    ]);
    const plan = planWaitingRefresh(staff, unread, { open: counts.openTotal, escalated: counts.escalated });
    await Promise.all([
      ...plan.update.map(({ id, count }) => prisma.notification.update({ where: { id }, data: { count } })),
      plan.markRead.length ? prisma.notification.updateMany({ where: { id: { in: plan.markRead } }, data: { read: true } }) : null,
    ]);
  } catch (err) {
    fail("refresh the reports-waiting notices")(err);
  }
}

// A librarian passed a report to admins. The admins see who, as staff naming staff.
export async function notifyAdminsOfEscalation(kind: ReportedKind, itemId: string, escalatedById: string): Promise<void> {
  try {
    const staff = await prisma.user.findMany({ where: staffWhere, select: staffSelect });
    const rows = escalationRecipients(staff, escalatedById).map((admin) => ({ userId: admin.id, actorId: escalatedById, type: "STAFF_ESCALATION" as const, message: kind }));
    await createNotifications(rows);
  } catch (err) {
    fail(`tell admins about escalated ${kind} ${itemId}`)(err);
  }
}

// An admin closed a report a librarian escalated: tell the librarian how it ended.
export async function notifyEscalationResolved(escalatedById: string, kind: ReportedKind, itemId: string, outcome: EscalationOutcome): Promise<void> {
  try {
    await createNotification({ userId: escalatedById, actorId: escalatedById, type: "ESCALATION_RESOLVED", message: escalationMessage(kind, outcome) });
  } catch (err) {
    fail(`tell ${escalatedById} that escalated ${kind} ${itemId} was closed`)(err);
  }
}

// Staff put a hidden review back up. reviewId is the reviewer's copy, where the review lives; its title is
// kept on the notification so it still reads right if the copy goes.
export async function notifyReviewRestored(userId: string, reviewId: string): Promise<void> {
  try {
    const copy = await prisma.book.findUnique({ where: { id: reviewId }, select: { title: true } });
    await createNotification({ userId, actorId: userId, type: "REVIEW_RESTORED", bookId: reviewId, message: copy?.title ?? null });
  } catch (err) {
    fail(`tell ${userId} their review ${reviewId} is back`)(err);
  }
}

// An admin changed someone's role. Nothing to say when it didn't really change.
export async function notifyRoleChanged(userId: string, from: string, to: string): Promise<void> {
  if (from === to) return;
  try {
    await createNotification({ userId, actorId: userId, type: "ROLE_CHANGED", message: to });
  } catch (err) {
    fail(`tell ${userId} their role changed`)(err);
  }
}
