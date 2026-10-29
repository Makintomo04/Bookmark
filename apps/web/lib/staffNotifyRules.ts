import { can, isSuspended } from "@/lib/roles";
import { waitingCount } from "@/lib/staffReportRules";

// Who hears what for lib/staffNotify.ts. Pure, so the tests can call it without a database.

export type StaffMember = { id: string; role?: string | null; isStaff?: boolean | null; suspendedAt?: Date | null; suspendedUntil?: Date | null };

// Who works the queue and should hear a report is waiting: every librarian and admin, except whoever
// filed it and anyone suspended.
export function reportRecipients(staff: StaffMember[], reporterId: string | null, now = new Date()): StaffMember[] {
  return staff.filter((s) => s.id !== reporterId && can(s, "reports.review") && !isSuspended(s, now));
}

// Admins, bar the one who escalated (an admin can escalate too) and anyone suspended.
export function escalationRecipients(staff: StaffMember[], escalatedById: string, now = new Date()): StaffMember[] {
  return staff.filter((s) => s.id !== escalatedById && can(s, "users.suspend") && !isSuspended(s, now));
}

export interface StaffReportPlan {
  create: { userId: string; count: number }[];
  // Unread STAFF_REPORT rows to bring up to date.
  update: { id: string; userId: string; count: number }[];
}

// One unread "reports waiting" per person: refresh theirs with the new count, or write one. Nobody with
// nothing waiting on them (an escalated item, for a librarian) is told.
export function planStaffReportNotices(
  recipients: StaffMember[],
  unread: { id: string; userId: string }[],
  counts: { open: number; escalated: number },
): StaffReportPlan {
  const unreadByUser = new Map(unread.map((n) => [n.userId, n.id]));
  const plan: StaffReportPlan = { create: [], update: [] };
  for (const person of recipients) {
    const count = waitingCount(counts, person);
    if (count <= 0) continue;
    const id = unreadByUser.get(person.id);
    if (id) plan.update.push({ id, userId: person.id, count });
    else plan.create.push({ userId: person.id, count });
  }
  return plan;
}

export interface WaitingRefreshPlan {
  // Unread STAFF_REPORT rows whose count is out of date.
  update: { id: string; count: number }[];
  // Unread rows with nothing left waiting on their owner: marked read.
  markRead: string[];
}

// After staff close or escalate reports: bring each unread "reports waiting" to what's waiting on its
// owner now, so the bell doesn't say 4 when it's 1. Nothing waiting (or no longer on the queue) marks it
// read. Owners missing from staff read as nothing waiting. Unchanged counts are left alone.
export function planWaitingRefresh(
  staff: StaffMember[],
  unread: { id: string; userId: string; count: number | null }[],
  counts: { open: number; escalated: number },
): WaitingRefreshPlan {
  const byId = new Map(staff.map((s) => [s.id, s]));
  const plan: WaitingRefreshPlan = { update: [], markRead: [] };
  for (const n of unread) {
    const person = byId.get(n.userId);
    const count = person && can(person, "reports.review") ? waitingCount(counts, person) : 0;
    if (count <= 0) plan.markRead.push(n.id);
    else if (count !== n.count) plan.update.push({ id: n.id, count });
  }
  return plan;
}
