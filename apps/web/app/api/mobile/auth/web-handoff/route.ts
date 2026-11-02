import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { appHandoffPath, createAppHandoff, handoffNext } from "@/lib/appHandoff";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";

// The phone asks for a link that opens the web already signed in as this reader (lib/appHandoff.ts).
// Body: { next: "/staff" }, a path on this site. Answers with the path to open on this server.
export async function POST(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const limit = rateLimit(`app-handoff:user:${currentUser.id}`, 10, 15 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });

  const body = await req.json().catch(() => null);
  const token = await createAppHandoff(currentUser.id);
  return NextResponse.json({ path: appHandoffPath(token, handoffNext(body?.next)) });
}
