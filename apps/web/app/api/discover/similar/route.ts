import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { similarBooks } from "@/lib/similarBooks";

// Books like one you've finished, for the Update sheet's "Because you finished" row. Empty when there are no good matches.
export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title")?.trim().slice(0, 200);
  const author = searchParams.get("author")?.trim().slice(0, 200);
  if (!title || !author) return NextResponse.json({ books: [] });
  const limit = rateLimit(`similar:${user.id}`, 60, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });
  return NextResponse.json({ books: await similarBooks(user.id, title, author) });
}
