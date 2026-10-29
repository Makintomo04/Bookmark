import { NextResponse } from "next/server";
import { forbidden, requireUser } from "@/lib/apiAuth";
import { can } from "@/lib/roles";
import { staffLog } from "@/lib/staffLog";

// /staff/log, newest first. ?before=<ISO date> pages back; ?target=<id> narrows to one account or book (and
// its editions); ?actor=<username>, ?action=<kind>, ?from= and ?to=<YYYY-MM-DD> filter. "staff.log" sees
// everything; "log.own" sees its own actions and any book's history (lib/staffLog.ts enforces which).
export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const everything = can(user, "staff.log");
  if (!everything && !can(user, "log.own")) return forbidden();
  const params = new URL(req.url).searchParams;
  return NextResponse.json(await staffLog({ id: user.id, everything }, {
    before: params.get("before"), targetId: params.get("target"), actor: params.get("actor"),
    action: params.get("action"), from: params.get("from"), to: params.get("to"),
  }));
}
