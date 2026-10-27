import { booksReadCount } from "@/lib/readerTier";
import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { blockedUserIds, canView, privacyOf, privacySelect, visibleReview, type Relation } from "@/lib/privacy";
import { NextResponse } from "next/server";

const FEED_SIZE = 20
// Some rows get dropped by privacy rules after the query, so read a few extra to still fill the page.
const FEED_OVERFETCH = 40

export async function GET(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

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
    return NextResponse.json([])
  }

  const activities = await prisma.activity.findMany({
    where: { userId: { in: followingIds } },
    orderBy: { createdAt: "desc" },
    take: FEED_OVERFETCH,
    include: {
      user: { select: { username: true, image: true, favColour: true, ...booksReadCount, ...privacySelect } },
      book: { select: { title: true, author: true, coverImage: true, cardColour: true, rating: true, status: true, review: true, reviewSpoiler: true, reviewPrivate: true, reviewHiddenAt: true, isPrivate: true } },
    },
  })

  // Everyone here is someone the viewer follows.
  const relation: Relation = { isSelf: false, isFollower: true, blocked: null }

  // Plain JSON rows: the shape ActivityFeedItem reads.
  const visible = activities.flatMap<Record<string, unknown>>(({ user, book, ...activity }) => {
    const { username, image, favColour, _count, ...stored } = user
    const publicUser = { username, image, favColour, _count }
    const privacy = privacyOf(stored)
    if (!canView(relation, privacy, "activity")) return []
    if (!book) return [{ ...activity, user: publicUser, book: null }]

    const { status, review, reviewSpoiler, reviewPrivate, reviewHiddenAt, isPrivate, ...publicBook } = book
    // A private book posts nothing, including what it posted before it was made private.
    if (isPrivate) return []
    // Adding to Want to read is a peek at that shelf.
    if (activity.type === "ADDED_BOOK" && status === "NOT_STARTED" && !canView(relation, privacy, "wantToRead")) return []
    // Will not read is the reader's own business, including books added to Want to read first.
    if (activity.type === "ADDED_BOOK" && status === "NOT_INTERESTED") return []

    if (activity.type !== "REVIEWED_BOOK") return [{ ...activity, user: publicUser, book: publicBook }]
    // A review the viewer can't read isn't announced at all.
    const shown = visibleReview({ review, reviewSpoiler, reviewPrivate, reviewHiddenAt }, relation, privacy)
    if (!shown.review) return []
    return [{ ...activity, user: publicUser, book: { ...publicBook, id: activity.bookId, review: shown.review, reviewSpoiler: shown.reviewSpoiler } }]
  })

  return NextResponse.json(visible.slice(0, FEED_SIZE))
}
