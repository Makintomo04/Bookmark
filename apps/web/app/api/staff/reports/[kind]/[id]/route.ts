import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { actOnReport, isReportKind, REPORT_ACTIONS, type ReportAction } from "@/lib/staffReports";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

type Params = { params: { kind: string; id: string } };

// Body: { action: "dismiss" | "hide" | "resolve" | "escalate", note }. Acts on every open report of the item.
export async function POST(req: Request, { params }: Params) {
  const { user, response } = await requirePermission("reports.review");
  if (response) return response;
  if (!isReportKind(params.kind)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { action, note } = await jsonBody(req);
  if (!(REPORT_ACTIONS as readonly unknown[]).includes(action)) return NextResponse.json({ error: "Pick an action." }, { status: 400 });
  return staffAnswer(await actOnReport(user, params.kind, params.id, action as ReportAction, typeof note === "string" ? note : undefined));
}
