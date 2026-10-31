import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { actOnReport, commentThread, isReportKind, putReviewBack, REPORT_ACTIONS, type ReportAction } from "@/lib/staffReports";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

type Params = { params: Promise<{ kind: string; id: string }> };

// A reported circle comment in its thread, for the report card (circles themselves are members-only).
export async function GET(req: Request, props: Params) {
  const params = await props.params;
  const { response } = await requirePermission("reports.review");
  if (response) return response;
  if (params.kind !== "comment") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return staffAnswer(await commentThread(params.id));
}

// Body: { action: "dismiss" | "hide" | "hide_rating" | "resolve" | "escalate", note }. Acts on every open
// report of the item; an escalated item only for admins. "unhide" puts a hidden review back up, from the
// closed tab (admins only, once an admin has been involved).
export async function POST(req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requirePermission("reports.review");
  if (response) return response;
  if (!isReportKind(params.kind)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { action, note } = await jsonBody(req);
  const cleanNote = typeof note === "string" ? note : undefined;
  if (action === "unhide" && params.kind === "review") return staffAnswer(await putReviewBack(user, params.id, cleanNote));
  if (!(REPORT_ACTIONS as readonly unknown[]).includes(action)) return NextResponse.json({ error: "Pick an action." }, { status: 400 });
  return staffAnswer(await actOnReport(user, params.kind, params.id, action as ReportAction, cleanNote));
}
