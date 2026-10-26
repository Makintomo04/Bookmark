import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { followedAuthors } from "@/lib/authorFollows";

// The authors the signed-in reader follows, for their own profile (the web's and the app's Library tab).
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  return NextResponse.json({ authors: await followedAuthors(user.id) });
}
