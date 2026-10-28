import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { bookPageData } from "@/lib/bookPage";
import { linkCatalog } from "@/lib/catalog";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { recommendFriends, recommendSchema, sendRecommendation } from "@/lib/recommendations";
import { normaliseBookKey } from "@/lib/workKey";

// Sending a book from its page without having it on your shelf: the recommendation points at the catalogue
// Work instead of your copy. Keyed like the page (an Open Library work key, or a catalogue Work id), and the
// book is looked up here rather than taken from the request, so nobody can send a made-up one.
async function pageBook(param: string) {
  const bookKey = normaliseBookKey(param);
  return bookKey ? bookPageData(bookKey) : null;
}

// The friends this book can be sent to.
export async function GET(_req: Request, props: { params: Promise<{ bookKey: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const data = await pageBook(params.bookKey);
  if (!data) return NextResponse.json({ error: "Book Not Found" }, { status: 404 });
  return NextResponse.json({ friends: await recommendFriends(currentUser.id, data.book) });
}

export async function POST(req: Request, props: { params: Promise<{ bookKey: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const parsed = recommendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const limit = rateLimit(`book-recommend:${currentUser.id}`, 30, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });

  const data = await pageBook(params.bookKey);
  if (!data) return NextResponse.json({ error: "Book Not Found" }, { status: 404 });
  // A book nobody on Bookmark has shelved yet has no Work until now: file it, as adding it would.
  const { book } = data;
  const workId = data.workId ?? (await linkCatalog(
    { workKey: book.workKey, hardcoverId: book.hardcoverId ?? null, title: book.title, author: book.author, pages: book.pages, coverUrl: book.coverUrl, year: book.year ?? null },
    { lookup: true },
  ))?.work.id;
  if (!workId) return NextResponse.json({ error: "Couldn't send that book. Try again." }, { status: 500 });

  const result = await sendRecommendation(currentUser.id, { workId }, parsed.data.usernames, parsed.data.message || null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ sent: result.sent, alreadySent: result.alreadySent });
}
