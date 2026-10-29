import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { can } from "@/lib/roles";
import { oldestOpenReportAt, reportCounts, staffActivity } from "@/lib/staffOverview";
import { waitingCount } from "@/lib/staffReportRules";

// The report counts, and `waiting`: what the badges on the Staff link and the Reports tab show (escalated
// items count only for admins). ?part=counts stops there; otherwise it adds the oldest open report and,
// for admins, who did what today and this week.
export async function GET(req: Request) {
  const { user, response } = await requirePermission("reports.review");
  if (response) return response;
  const counts = await reportCounts();
  const waiting = waitingCount({ open: counts.openTotal, escalated: counts.escalated }, user);
  if (new URL(req.url).searchParams.get("part") === "counts") return NextResponse.json({ ...counts, waiting });
  const [oldestOpenAt, activity] = await Promise.all([oldestOpenReportAt(), can(user, "staff.log") ? staffActivity() : null]);
  return NextResponse.json({ ...counts, waiting, oldestOpenAt, activity });
}
