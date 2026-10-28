import { booksReadCount } from "@/lib/readerTier";
import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { blockedUserIds, canView, privacyOf, privacySelect, visibleReview, type Relation } from "@/lib/privacy";
import { NextResponse } from "next/server";

// What the people the reader follows are doing, newest first, a page at a time. The feed pages back with
// ?after=<the cursor the last page sent>, up to 50 at a time. Ordered by date then id, so two posted in the
// same moment never fall between pages.
const PAGE = 20
const PAGE_MAX = 50

export async function GET(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const params = new URL(req.url).searchParams
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(params.get("limit")) || PAGE))
  const after = params.get("after")
  const afterId = after && /^[a-f0-9]{24}$/i.test(after) ? after : null

  const [follows, blocked] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: currentUser.id },
      select: { followingId: true },
    }),
    blockedUserIds(currentUser.id),
  ])
  // Blocking removes follows, but leave blocked users out here too in case one slipped through.
  const blockedIds = new Set(blocked)
  const followingIds = follows.map(f => f.followingId).filter(id => !blockedIds.has(id))

  if (followingIds.length === 0) {
    return NextResponse.json({ activities: [], hasMore: false, next: null })
  }

  // Privacy rules drop some rows after the query, so read twice the page to still fill it, plus one to
  // say whether there's another page.
  const batch = limit * 2
  const rows = await prisma.activity.findMany({
    where: { userId: { in: followingIds } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
    take: batch + 1,
    include: {
      user: { select: { username: true, displayName: true, image: true, favColour: true, ...booksReadCount, ...privacySelect } },
      book: { select: { title: true, author: true, coverImage: true, cardColour: true, rating: true, status: true, review: true, reviewSpoiler: true, reviewPrivate: true, reviewHiddenAt: true, isPrivate: true } },
    },
  })
  const examined = rows.slice(0, batch)

  // Everyone here is someone the viewer follows.
  const relation: Relation = { isSelf: false, isFollower: true, blocked: null }

  // The row as ActivityFeedItem reads it, or null when the viewer may not see it.
  const visibleRow = ({ user, book, ...activity }: (typeof rows)[number]): Record<string, unknown> | null => {
    const { username, displayName, image, favColour, _count, ...stored } = user
    const publicUser = { username, displayName, image, favColour, _count }
    const privacy = privacyOf(stored)
    if (!canView(relation, privacy, "activity")) return null
    if (!book) return { ...activity, user: publicUser, book: null }

    const { status, review, reviewSpoiler, reviewPrivate, reviewHiddenAt, isPrivate, ...publicBook } = book
    // A private book posts nothing, including what it posted before it was made private.
    if (isPrivate) return null
    // Adding to Want to read is a peek at that shelf.
    if (activity.type === "ADDED_BOOK" && status === "NOT_STARTED" && !canView(relation, privacy, "wantToRead")) return null
    // Will not read is the reader's own business, including books added to Want to read first.
    if (activity.type === "ADDED_BOOK" && status === "NOT_INTERESTED") return null
    // Stopping a book is the reader's own business when they keep Did not finish to themselves.
    if (activity.type === "DNF_BOOK" && !canView(relation, privacy, "didNotFinish")) return null

    if (activity.type !== "REVIEWED_BOOK") return { ...activity, user: publicUser, book: publicBook }
    // A review the viewer can't read isn't announced at all.
    const shown = visibleReview({ review, reviewSpoiler, reviewPrivate, reviewHiddenAt }, relation, privacy)
    if (!shown.review) return null
    return { ...activity, user: publicUser, book: { ...publicBook, id: activity.bookId, review: shown.review, reviewSpoiler: shown.reviewSpoiler } }
  }

  // Walk the batch until the page is full. The cursor is the last row looked at, visible or not, so the
  // next page carries on from there rather than re-reading rows that were dropped.
  const activities: Record<string, unknown>[] = []
  let stoppedAt = examined.length - 1
  for (let i = 0; i < examined.length; i++) {
    const row = visibleRow(examined[i])
    if (row) activities.push(row)
    if (activities.length === limit) { stoppedAt = i; break }
  }
  const hasMore = stoppedAt < examined.length - 1 || rows.length > batch
  const next = hasMore ? examined[stoppedAt].id : null

  return NextResponse.json({ activities, hasMore, next })
}
