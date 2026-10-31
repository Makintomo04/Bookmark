import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { isReportView, reportQueue } from "@/lib/staffReports";

// /staff/reports: ?view=open (the default), escalated or closed.
export async function GET(req: Request) {
  const { response } = await requirePermission("reports.review");
  if (response) return response;
  const view = new URL(req.url).searchParams.get("view");
  return NextResponse.json(await reportQueue(isReportView(view) ? view : "open"));
}
