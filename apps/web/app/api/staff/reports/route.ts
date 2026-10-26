import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { reportQueue } from "@/lib/staffReports";

// /staff/reports: ?view=queue (open and escalated, the default) or ?view=closed.
export async function GET(req: Request) {
  const { response } = await requirePermission("reports.review");
  if (response) return response;
  const view = new URL(req.url).searchParams.get("view") === "closed" ? "closed" : "queue";
  return NextResponse.json(await reportQueue(view));
}
