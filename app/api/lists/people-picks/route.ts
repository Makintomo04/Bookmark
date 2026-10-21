import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { peoplePicksForBook } from "@/lib/lists";
import { normaliseWorkKey } from "@/lib/workKey";

// Book details: people the signed-in reader follows who listed this book or rated it 4+, with their
// reasons. Signed out, there's nobody to ask, so it answers with an empty list rather than a 401.
export async function GET(req: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ signedIn: false, followsAnyone: false, picks: [] });
  }

  const { searchParams } = new URL(req.url);
  const book = {
    workKey: normaliseWorkKey(searchParams.get("workKey")),
    title: (searchParams.get("title") ?? "").trim().slice(0, 300),
    author: (searchParams.get("author") ?? "").trim().slice(0, 200) || "Unknown",
  };
  if (!book.workKey && !book.title) {
    return NextResponse.json({ error: "Which book?" }, { status: 400 });
  }

  const result = await peoplePicksForBook(viewer.id, book);
  return NextResponse.json({ signedIn: true, ...result });
}
