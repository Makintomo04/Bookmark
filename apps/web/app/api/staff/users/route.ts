import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { searchStaffUsers } from "@/lib/staffUsers";

// /staff/users: search accounts by username, email, name or id. Newest first with no query.
export async function GET(req: Request) {
  const { response } = await requirePermission("users.view");
  if (response) return response;
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json(await searchStaffUsers(q));
}
