import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { NOTE_PAGE_SIZE, NOTE_QUERY_MAX, searchNotes } from "@/lib/noteSearch";
import { rateLimit } from "@/lib/rateLimit";
import { bookHref } from "@/lib/workKey";

// Every note the signed-in reader has written, across their books (BOO-13, /notes).
//
//   GET /api/notes                       newest first, a page at a time
//   GET /api/notes?q=grief               only the notes with those words, best match first (lib/noteSearch.ts)
//   GET /api/notes?offset=30             the next page of either
//   GET /api/notes?from=2026-03-01&to=2026-03-31
//
// Free: these are the reader's own notes, already on each book's page and in the export. The notes are
// read through the reader's own books, so nobody else's ever come back. No AI.

// Notes read per request. A reader with more than this sees the newest.
const NOTES_MAX = 5000;
const PER_MINUTE = 60;

const noStore = { "Cache-Control": "private, no-store" };

const querySchema = z.object({
  q: z.string().trim().max(NOTE_QUERY_MAX).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "That search didn't work." }, { status: 400 });

  const limited = rateLimit(`notes:${user.id}`, PER_MINUTE, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "That's a lot of searches at once. Wait a minute and try again." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } });
  }

  const { q, offset, from, to } = parsed.data;
  const books = await prisma.book.findMany({
    where: { userId: user.id },
    select: { id: true, title: true, author: true, workKey: true, workId: true },
  });
  const bookById = new Map(books.map((b) => [b.id, b]));

  const notes = await prisma.note.findMany({
    where: {
      bookId: { in: books.map((b) => b.id) },
      ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
    },
    select: { id: true, bookId: true, title: true, content: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: NOTES_MAX,
  });

  // A filter of one letter matches nearly everything, so it counts as no filter.
  const filtering = !!q && q.length >= 2;
  const ordered = filtering
    ? searchNotes(notes, q, Infinity)
    : notes.map((note) => ({ note, snippet: note.content, matched: [] as string[] }));

  const page = ordered.slice(offset, offset + NOTE_PAGE_SIZE).flatMap(({ note, snippet, matched }) => {
    const book = bookById.get(note.bookId);
    if (!book) return [];
    return [{
      id: note.id,
      title: note.title,
      snippet,
      matched,
      createdAt: note.createdAt,
      book: { id: book.id, title: book.title, author: book.author, href: bookHref({ workKey: book.workKey, pageWorkId: book.workId, title: book.title }) },
    }];
  });

  const next = offset + NOTE_PAGE_SIZE < ordered.length ? offset + NOTE_PAGE_SIZE : null;
  return NextResponse.json({ notes: page, total: ordered.length, next }, { headers: noStore });
}
