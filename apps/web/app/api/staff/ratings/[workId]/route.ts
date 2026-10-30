import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { actOnSpike, isSpikeAction } from "@/lib/ratingSpikes";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

// Body: { action: "dismiss" | "hold" | "release", note }.
export async function POST(req: Request, { params }: { params: Promise<{ workId: string }> }) {
  const { user, response } = await requirePermission("reports.review");
  if (response) return response;
  const { action, note } = await jsonBody(req);
  if (!isSpikeAction(action)) return NextResponse.json({ error: "Pick an action." }, { status: 400 });
  const { workId } = await params;
  return staffAnswer(await actOnSpike(user, workId, action, typeof note === "string" ? note : undefined));
}
