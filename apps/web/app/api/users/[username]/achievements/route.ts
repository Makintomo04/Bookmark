import getCurrentUser from "@/app/actions/getCurrentUser";
import { handleOf } from "@/lib/handle";
import { getAchievementsView } from "@/lib/publicProfile";
import { NextResponse } from "next/server";

export async function GET(req: Request, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  // A reader's tier and medals, as far as their profile privacy allows (getAchievementsView applies it).
  const currentUser = await getCurrentUser();
  const view = await getAchievementsView(handleOf(params.username), currentUser?.id);

  if (!view || (view.access === "restricted" && view.reason === "unavailable")) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (view.access === "restricted") {
    // Like the profile route: whose it is and why it's hidden, nothing about their reading.
    return NextResponse.json({ username: view.profile.username, displayName: view.profile.displayName, staffBadge: view.profile.staffBadge, restricted: view.reason, booksRead: null, ladders: [], isSelf: false });
  }
  return NextResponse.json({ ...view.achievements, restricted: null, isSelf: view.relation.isSelf });
}
