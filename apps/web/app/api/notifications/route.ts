import { booksReadCount } from "@/lib/readerTier";
import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { bookHref, sameBook } from "@/lib/workKey";
import { hasPage } from "@/lib/workPages";
import { staffBadgeOf, staffBadgeSelect } from "@/lib/staffBadge";
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
        actor: { select: { username: true, displayName: true, image: true, favColour: true, ...booksReadCount, ...staffBadgeSelect } },
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

  // Recommendations name the sender's copy of the book, or the catalogue Work when they sent it from its page
  // without shelving it, link to its page, and say whether it's already on the reader's shelf.
  const isRecommended = (n: (typeof notifications)[number]) => n.type === "BOOK_RECOMMENDED"
  const recommendedIds = Array.from(new Set(notifications.flatMap((n) => (isRecommended(n) && n.bookId ? [n.bookId] : []))))
  const recommendedWorkIds = Array.from(new Set(notifications.flatMap((n) => (isRecommended(n) && !n.bookId && n.workId ? [n.workId] : []))))
  const [copies, recommendedWorks] = await Promise.all([
    recommendedIds.length > 0
      ? prisma.book.findMany({ where: { id: { in: recommendedIds } }, select: { id: true, title: true, author: true, coverImage: true, workKey: true, workId: true } })
      : [],
    recommendedWorkIds.length > 0
      ? prisma.work.findMany({ where: { id: { in: recommendedWorkIds } }, select: { id: true, title: true, authors: true, coverUrl: true, openLibraryKey: true, hardcoverId: true, pageApprovedAt: true } })
      : [],
  ])
  const recommended = [
    ...copies,
    ...recommendedWorks.map((w) => ({ id: w.id, title: w.title, author: w.authors[0] ?? "Unknown", coverImage: w.coverUrl ?? "", workKey: w.openLibraryKey, workId: hasPage(w) ? w.id : null })),
  ]
  const mine = recommended.length > 0
    ? await prisma.book.findMany({
        where: { userId: currentUser.id, status: { not: "NOT_INTERESTED" }, OR: [{ workKey: { in: recommended.flatMap((b) => (b.workKey ? [b.workKey] : [])) } }, { title: { in: recommended.map((b) => b.title) } }] },
        select: { title: true, author: true, workKey: true },
      })
    : []
  const recommendedById = new Map(recommended.map(({ workKey, workId, ...b }) => [b.id, {
    ...b,
    onShelf: mine.some((m) => sameBook(m, { ...b, workKey })),
    href: bookHref({ workKey, pageWorkId: workId, title: b.title }),
  }]))
  const withRecommendations = withBuddyReads.map((n) => {
    if (!isRecommended(n)) return n
    const id = n.bookId ?? n.workId
    return { ...n, book: id ? recommendedById.get(id) ?? null : null }
  })

  // A hidden (or restored) review names the reader's own copy, and links to the book's page where they can see it.
  const hiddenIds = Array.from(new Set(notifications.flatMap((n) => ((n.type === "REVIEW_HIDDEN" || n.type === "REVIEW_RESTORED") && n.bookId ? [n.bookId] : []))))
  const hiddenCopies = hiddenIds.length > 0
    ? await prisma.book.findMany({ where: { id: { in: hiddenIds }, userId: currentUser.id }, select: { id: true, title: true, author: true, coverImage: true, workKey: true, workId: true } })
    : []
  const hiddenById = new Map(hiddenCopies.map(({ workKey, workId, ...b }) => [b.id, { ...b, onShelf: true, href: bookHref({ workKey, pageWorkId: workId, title: b.title }) }]))
  const withHiddenReviews = withRecommendations.map((n) => (n.type === "REVIEW_HIDDEN" || n.type === "REVIEW_RESTORED" ? { ...n, book: n.bookId ? hiddenById.get(n.bookId) ?? null : null } : n))

  // A comment on a review (or a reply) names the book and links to the review's page, whoever wrote it.
  const isReviewComment = (n: (typeof notifications)[number]) => n.type === "REVIEW_COMMENT" || n.type === "REVIEW_REPLY"
  const reviewBookIds = Array.from(new Set(notifications.flatMap((n) => (isReviewComment(n) && n.bookId ? [n.bookId] : []))))
  const reviewCopies = reviewBookIds.length > 0
    ? await prisma.book.findMany({ where: { id: { in: reviewBookIds } }, select: { id: true, title: true, user: { select: { username: true } } } })
    : []
  const reviewById = new Map(reviewCopies.map((b) => [b.id, { title: b.title, href: b.user.username ? `/u/${encodeURIComponent(b.user.username)}/reviews/${b.id}` : null }]))
  const withReviewComments = withHiddenReviews.map((n) => (isReviewComment(n) ? { ...n, review: n.bookId ? reviewById.get(n.bookId) ?? null : null } : n))

  // A new book in a series names the book, its series and place, and links to its page. A new book
  // announced, or one out today, names the book, its author and its date.
  const aboutWork = (n: (typeof notifications)[number]) => n.type === "NEW_IN_SERIES" || n.type === "NEW_BOOK" || n.type === "PUBLICATION_DAY"
  const workIds = Array.from(new Set(notifications.flatMap((n) => (aboutWork(n) && n.workId ? [n.workId] : []))))
  const works = workIds.length > 0
    ? await prisma.work.findMany({ where: { id: { in: workIds } }, select: { id: true, title: true, authors: true, coverUrl: true, openLibraryKey: true, hardcoverId: true, pageApprovedAt: true, seriesName: true, seriesPosition: true, releaseDate: true } })
    : []
  const workById = new Map(works.map((w) => [w.id, {
    title: w.title,
    author: w.authors[0] ?? null,
    coverUrl: w.coverUrl,
    seriesName: w.seriesName,
    seriesPosition: w.seriesPosition,
    releaseDate: w.releaseDate,
    // Series books are filed from Hardcover, so nearly all have a page (lib/workPages.ts).
    href: bookHref({ workKey: w.openLibraryKey, pageWorkId: hasPage(w) ? w.id : null, title: w.title }),
  }]))
  const withWorks = withReviewComments.map((n) => (aboutWork(n) ? { ...n, work: n.workId ? workById.get(n.workId) ?? null : null } : n))

  // The actor's staff seal, if any, instead of the role fields it came from: hideStaffBadge says a librarian
  // is one, so it never leaves the server.
  const withSeals = withWorks.map(({ actor: { role, isStaff, hideStaffBadge, ...actor }, ...n }) => ({
    ...n,
    actor: { ...actor, staffBadge: staffBadgeOf({ role, isStaff, hideStaffBadge }) },
  }))

  return NextResponse.json({ notifications: withSeals, unreadCount, hasMore })
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
