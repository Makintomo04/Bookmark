import { booksReadCount } from "@/lib/readerTier";
import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { bookHref, sameBook } from "@/lib/workKey";
import { NextResponse } from "next/server";

// The bell shows the newest 20. /notifications pages back through the rest with ?after=<the last one's id>,
// up to 50 at a time. Ordered by date then id, so two made in the same moment never fall between pages.
const PAGE = 20
const PAGE_MAX = 50

export async function GET(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const params = new URL(req.url).searchParams
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(params.get("limit")) || PAGE))
  const after = params.get("after")
  const afterId = after && /^[a-f0-9]{24}$/i.test(after) ? after : null

  // Quests were cut before launch; any old quest-medal notifications are left out.
  const shown = { userId: currentUser.id, type: { not: "QUEST_COMPLETED" as const } }
  const [page, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: shown,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
      // One extra says whether there's another page.
      take: limit + 1,
      include: {
        actor: { select: { username: true, displayName: true, image: true, favColour: true, ...booksReadCount } },
      },
    }),
    prisma.notification.count({ where: { ...shown, read: false } }),
  ])
  const hasMore = page.length > limit
  const notifications = page.slice(0, limit)

  // Reading circle notifications name the book. buddyReadId is a plain id, so look the titles up in one go.
  const buddyReadIds = Array.from(new Set(notifications.flatMap((n) => (n.buddyReadId ? [n.buddyReadId] : []))))
  const buddyReads = buddyReadIds.length > 0
    ? await prisma.buddyRead.findMany({ where: { id: { in: buddyReadIds } }, select: { id: true, title: true, inviteCode: true, status: true } })
    : []
  const buddyReadById = new Map(buddyReads.map((b) => [b.id, b]))
  const withBuddyReads = notifications.map((n) => (n.buddyReadId ? { ...n, buddyRead: buddyReadById.get(n.buddyReadId) ?? null } : n))

  // Recommendations name the sender's copy of the book, and say whether it's already on the reader's shelf.
  const recommendedIds = Array.from(new Set(notifications.flatMap((n) => (n.type === "BOOK_RECOMMENDED" && n.bookId ? [n.bookId] : []))))
  const recommended = recommendedIds.length > 0
    ? await prisma.book.findMany({ where: { id: { in: recommendedIds } }, select: { id: true, title: true, author: true, coverImage: true, workKey: true } })
    : []
  const mine = recommended.length > 0
    ? await prisma.book.findMany({
        where: { userId: currentUser.id, status: { not: "NOT_INTERESTED" }, OR: [{ workKey: { in: recommended.flatMap((b) => (b.workKey ? [b.workKey] : [])) } }, { title: { in: recommended.map((b) => b.title) } }] },
        select: { title: true, author: true, workKey: true },
      })
    : []
  const recommendedById = new Map(recommended.map(({ workKey, ...b }) => [b.id, { ...b, onShelf: mine.some((m) => sameBook(m, { ...b, workKey })) }]))
  const withRecommendations = withBuddyReads.map((n) => (n.type === "BOOK_RECOMMENDED" ? { ...n, book: n.bookId ? recommendedById.get(n.bookId) ?? null : null } : n))

  // A hidden review names the reader's own copy, and links to the book's page where they can see it.
  const hiddenIds = Array.from(new Set(notifications.flatMap((n) => (n.type === "REVIEW_HIDDEN" && n.bookId ? [n.bookId] : []))))
  const hiddenCopies = hiddenIds.length > 0
    ? await prisma.book.findMany({ where: { id: { in: hiddenIds }, userId: currentUser.id }, select: { id: true, title: true, author: true, coverImage: true, workKey: true, workId: true } })
    : []
  const hiddenById = new Map(hiddenCopies.map(({ workKey, workId, ...b }) => [b.id, { ...b, onShelf: true, href: bookHref({ workKey, pageWorkId: workId, title: b.title }) }]))
  const withHiddenReviews = withRecommendations.map((n) => (n.type === "REVIEW_HIDDEN" ? { ...n, book: n.bookId ? hiddenById.get(n.bookId) ?? null : null } : n))

  // A new book in a series names the book, its series and place, and links to its page.
  const workIds = Array.from(new Set(notifications.flatMap((n) => (n.type === "NEW_IN_SERIES" && n.workId ? [n.workId] : []))))
  const works = workIds.length > 0
    ? await prisma.work.findMany({ where: { id: { in: workIds } }, select: { id: true, title: true, coverUrl: true, openLibraryKey: true, hardcoverId: true, seriesName: true, seriesPosition: true } })
    : []
  const workById = new Map(works.map((w) => [w.id, {
    title: w.title,
    coverUrl: w.coverUrl,
    seriesName: w.seriesName,
    seriesPosition: w.seriesPosition,
    // A work with neither key has no page (lib/workPages.ts); series books are filed from Hardcover, so have one.
    href: bookHref({ workKey: w.openLibraryKey, pageWorkId: w.hardcoverId ? w.id : null, title: w.title }),
  }]))
  const withWorks = withHiddenReviews.map((n) => (n.type === "NEW_IN_SERIES" ? { ...n, work: n.workId ? workById.get(n.workId) ?? null : null } : n))

  return NextResponse.json({ notifications: withWorks, unreadCount, hasMore })
}

export async function PATCH(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const body = await req.json()
  const { id, all } = body

  if (all) {
    await prisma.notification.updateMany({
      where: { userId: currentUser.id, read: false },
      data: { read: true },
    })
    return NextResponse.json({ success: true })
  }

  if (!id) {
    return NextResponse.json({ error: 'id or all is required' }, { status: 400 })
  }

  const notification = await prisma.notification.findUnique({ where: { id } })
  if (!notification || notification.userId !== currentUser.id) {
    return NextResponse.json({ error: 'Notification Not Found' }, { status: 404 })
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { read: true },
  })
  return NextResponse.json(updated)
}
