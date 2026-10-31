import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { can } from "@/lib/roles";
import { searchStaffUsers } from "@/lib/staffUsers";
import { isRoleFilter, searchLimit } from "@/lib/staffUserRules";

// /staff/users: search accounts by username, display name or id (and email or name, for admins).
// Newest first with no query. ?role= narrows to a role (the team list), ?limit= pages ("Show more"),
// and ?appeals=open lists readers with an appeal waiting, for admins.
// Answers { users, hasMore }.
export async function GET(req: Request) {
  const { user, response } = await requirePermission("users.view");
  if (response) return response;
  const params = new URL(req.url).searchParams;
  const role = params.get("role");
  return NextResponse.json(await searchStaffUsers(user, {
    query: params.get("q") ?? "",
    role: isRoleFilter(role) ? role : "all",
    openAppeals: params.get("appeals") === "open" && can(user, "users.suspend"),
    limit: searchLimit(params.get("limit")),
  }));
}
