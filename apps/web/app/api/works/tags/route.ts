import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { catalogIds, linkCatalog } from "@/lib/catalog";
import { isObjectId } from "@/lib/buddyReadsServer";
import { normaliseBookKey, normaliseWorkKey } from "@/lib/workKey";
import { hasPageWhere } from "@/lib/workPages";
import { aggregateTags, readerTagsSchema, spiceApplies, type SpiceContext, type TagAggregate } from "@/lib/workTags";

// Moods, content warnings and spice live on the shared Work, so every reader of a book sees one aggregate.
//
//   GET /api/works/tags?bookId=<shelf book>   the aggregate plus the reader's own tags (owner only)
//   GET /api/works/tags?workKey=OL45883W      the aggregate for a Discover book; public, like search (or a catalogue Work id)
//   PUT /api/works/tags { bookId, moods, warnings, spice? }   the reader's tags for that book's work
//
// Spice only counts from a reader who has finished the book, now or on an earlier read, and only for a
// book spice applies to (spiceApplies in lib/workTags.ts). Otherwise it's ignored and what they reported
// before is kept, as it is when `spice` is left out.

const empty = (workId: string | null, about?: SpiceContext): TagAggregate & { workId: string | null } =>
  ({ workId, readers: 0, moods: [], warnings: [], spice: { level: null, early: null, reports: 0 }, spiceApplies: spiceApplies(about, []), mine: null })

// The Work a shelf book belongs to, filing it in the catalog if the backfill hasn't got to it yet
// (by title and author only: no Open Library call on the way to saving a review).
async function workIdForBook(book: { id: string, workId: string | null, workKey: string | null, title: string, author: string, pages: number }) {
  if (book.workId) return book.workId
  const resolved = await linkCatalog({ workKey: book.workKey, title: book.title, author: book.author, pages: book.pages || null }, { lookup: false })
  if (!resolved) return null
  await prisma.book.update({ where: { id: book.id }, data: catalogIds(resolved) })
  return resolved.work.id
}

// What spiceApplies goes on: the work's subjects and the genres readers have shelved it under.
async function spiceContext(workId: string): Promise<SpiceContext> {
  const [work, shelved] = await Promise.all([
    prisma.work.findUnique({ where: { id: workId }, select: { subjects: true } }),
    prisma.book.findMany({ where: { workId, genre: { not: null } }, select: { genre: true }, distinct: ["genre"], take: 50 }),
  ])
  return { subjects: work?.subjects ?? [], genres: shelved.map((b) => b.genre) }
}

async function loadAggregate(workId: string, viewerId: string | null, about: SpiceContext) {
  const rows = await prisma.readerTags.findMany({ where: { workId }, take: 1000, select: { userId: true, moods: true, warnings: true, spice: true } })
  // Tags from deleted accounts don't count.
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true } })
  const live = new Set(users.map((u) => u.id))
  return { workId, ...aggregateTags(rows.filter((r) => live.has(r.userId)), viewerId, about) }
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const bookId = params.get("bookId")
  const bookKey = normaliseBookKey(params.get("workKey"))

  if (bookId) {
    const { user, response } = await requireUser()
    if (response) return response
    const book = isObjectId(bookId) ? await prisma.book.findUnique({ where: { id: bookId } }) : null
    if (!book || book.userId !== user.id) return NextResponse.json({ error: "Book not found" }, { status: 404 })
    if (!book.workId) return NextResponse.json(empty(null, { genres: [book.genre] }))
    return NextResponse.json(await loadAggregate(book.workId, user.id, await spiceContext(book.workId)), { headers: { "Cache-Control": "private, no-store" } })
  }

  if (bookKey) {
    const viewer = await getCurrentUser()
    const workKey = normaliseWorkKey(bookKey)
    const work = await prisma.work.findFirst({ where: workKey ? { openLibraryKey: workKey } : { id: bookKey, ...hasPageWhere }, select: { id: true } })
    if (!work) return NextResponse.json(empty(null))
    return NextResponse.json(await loadAggregate(work.id, viewer?.id ?? null, await spiceContext(work.id)), { headers: { "Cache-Control": "private, no-store" } })
  }

  return NextResponse.json({ error: "bookId or workKey is required" }, { status: 400 })
}

const putSchema = readerTagsSchema.extend({ bookId: z.string().min(1) })

export async function PUT(req: Request) {
  const { user, response } = await requireUser()
  if (response) return response

  const parsed = putSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const { bookId, moods, warnings } = parsed.data

  const book = isObjectId(bookId) ? await prisma.book.findUnique({ where: { id: bookId } }) : null
  if (!book || book.userId !== user.id) return NextResponse.json({ error: "Book not found" }, { status: 404 })
  const workId = await workIdForBook(book)
  if (!workId) return NextResponse.json({ error: "Couldn't file this book in the catalog. Try again later." }, { status: 503 })

  const about = await spiceContext(workId)
  const [before, earlierFinishes] = await Promise.all([
    loadAggregate(workId, user.id, about),
    prisma.bookRead.count({ where: { bookId: book.id, status: "COMPLETED" } }),
  ])
  const finished = book.status === "COMPLETED" || earlierFinishes > 0
  // The reader's own warnings count too, so flagging sexual content and giving a spice level save together,
  // and so does an earlier answer, which they can always change or clear (spiceAskable says the same).
  const applies = before.spiceApplies || before.mine?.spice != null || spiceApplies(about, warnings)
  const spice = finished && applies && parsed.data.spice !== undefined ? parsed.data.spice : before.mine?.spice ?? null

  if (moods.length === 0 && warnings.length === 0 && spice === null) {
    await prisma.readerTags.deleteMany({ where: { workId, userId: user.id } })
  } else {
    await prisma.readerTags.upsert({
      where: { workId_userId: { workId, userId: user.id } },
      create: { workId, userId: user.id, moods, warnings, spice },
      update: { moods, warnings, spice },
    })
  }
  return NextResponse.json(await loadAggregate(workId, user.id, about))
}
