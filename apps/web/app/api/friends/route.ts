import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { friendsOf } from "@/lib/friends";

// The signed-in reader's friends (readers they follow who follow them back), by username: the reading
// circle invite picker on the web and in the app.
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const friends = await friendsOf(user.id);
  return NextResponse.json(friends.map(({ id, ...f }) => f), { headers: { "Cache-Control": "private, no-store" } });
}
