import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { followedAuthors } from "@/lib/authorFollows";

// The authors the signed-in reader follows (Settings, on web and in the app).
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  return NextResponse.json({ authors: await followedAuthors(user.id) });
}
