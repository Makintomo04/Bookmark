import prisma from "@/lib/db";
import { escalatedItemIds, openReportWhere, reportRows } from "@/lib/staffReports";
import { activityWindows, REPORT_KINDS, REPORTED_ITEM_FIELD, type ReportKind } from "@/lib/staffReportRules";

// /staff's overview, the Reports tab's counts and the badge on the Staff link. Counts are of reported
// things, not reports, so they match the cards: ten reports of one list are one.

export interface ReportCounts {
  // Waiting for a librarian, by kind, and in all. Escalated items aren't in these.
  open: Record<ReportKind, number>;
  openTotal: number;
  escalated: number;
}

export interface StaffActivity {
  actorId: string;
  username: string | null;
  today: number;
  week: number;
}

export async function reportCounts(): Promise<ReportCounts> {
  const escalatedIds = await escalatedItemIds();
  const waiting = await Promise.all(REPORT_KINDS.map(async (kind) => {
    const field = REPORTED_ITEM_FIELD[kind];
    const rows = await reportRows(kind).findMany({ where: openReportWhere, select: { [field]: true }, distinct: [field] });
    const escalated = new Set(escalatedIds[kind]);
    return rows.filter((r) => !escalated.has(r[field] as string)).length;
  }));
  const open = Object.fromEntries(REPORT_KINDS.map((kind, i) => [kind, waiting[i]])) as Record<ReportKind, number>;
  return {
    open,
    openTotal: waiting.reduce((a, b) => a + b, 0),
    escalated: REPORT_KINDS.reduce((sum, kind) => sum + escalatedIds[kind].length, 0),
  };
}

// When the longest-waiting open report came in (escalated ones aside), or null with nothing waiting.
export async function oldestOpenReportAt(): Promise<string | null> {
  const escalatedIds = await escalatedItemIds();
  const oldest = await Promise.all(REPORT_KINDS.map((kind) => {
    const field = REPORTED_ITEM_FIELD[kind];
    const ids = escalatedIds[kind];
    return reportRows(kind).findFirst({
      where: ids.length ? { ...openReportWhere, [field]: { notIn: ids } } : openReportWhere,
      orderBy: { createdAt: "asc" }, select: { createdAt: true },
    });
  }));
  const times = oldest.map((r) => (r?.createdAt as Date | undefined)?.getTime()).filter((t): t is number => t !== undefined);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

// Staff actions today and this week, by person, busiest first. Admins only (staff.log).
export async function staffActivity(now = new Date()): Promise<StaffActivity[]> {
  const { today, week } = activityWindows(now);
  const rows = await prisma.staffAction.findMany({ where: { createdAt: { gte: week } }, select: { actorId: true, createdAt: true } });
  const byActor = new Map<string, { today: number; week: number }>();
  for (const r of rows) {
    const counts = byActor.get(r.actorId) ?? { today: 0, week: 0 };
    counts.week++;
    if (r.createdAt >= today) counts.today++;
    byActor.set(r.actorId, counts);
  }
  const users = await prisma.user.findMany({ where: { id: { in: Array.from(byActor.keys()) } }, select: { id: true, username: true } });
  const username = new Map(users.map((u) => [u.id, u.username]));
  return Array.from(byActor, ([actorId, counts]) => ({ actorId, username: username.get(actorId) ?? null, ...counts }))
    .sort((a, b) => b.week - a.week || b.today - a.today);
}

// Suspended readers' appeals waiting for an admin to decide (lib/staffAppeals.ts), and when the oldest came in.
export async function openAppeals(): Promise<{ count: number; oldestAt: string | null }> {
  const [count, oldest] = await Promise.all([
    prisma.appeal.count({ where: { status: "OPEN" } }),
    prisma.appeal.findFirst({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  return { count, oldestAt: oldest?.createdAt.toISOString() ?? null };
}
