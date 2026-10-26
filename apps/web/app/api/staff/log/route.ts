import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { staffLog } from "@/lib/staffLog";

// /staff/log, newest first. ?before=<ISO date> pages back; ?target=<id> narrows to one account or book.
export async function GET(req: Request) {
  const { response } = await requirePermission("staff.log");
  if (response) return response;
  const params = new URL(req.url).searchParams;
  return NextResponse.json(await staffLog({ before: params.get("before"), targetId: params.get("target") }));
}
