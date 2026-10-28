import getCurrentUser from "@/app/actions/getCurrentUser";
import { handleOf } from "@/lib/handle";
import { getFollowList } from "@/lib/follows";
import { canViewUsername } from "@/lib/privacy";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: { username: string } }
) {
  // Hidden along with the counts: a private profile, a block, or "hide follower counts".
  const viewer = await getCurrentUser();
  const allowed = await canViewUsername(viewer?.id, handleOf(params.username), "followCounts");
  if (allowed === null) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "This reader keeps their connections private." }, { status: 403 });
  return getFollowList(req, handleOf(params.username), "following");
}
