import prisma from "./db"
import { booksReadCount } from "./readerTier"
import { blockedUserIds, privacyOf, privacySelect, sharedBookWhere, visibleReview } from "./privacy"
import { copiesOfWork } from "./readerCounts"
import { staffBadgeOf, staffBadgeSelect } from "./staffBadge"
import { REVIEWS_PAGE, orderReviews, summariseRatings, type RatingSummary, type WorkReviewsPage } from "./workReviewRules"

export * from "./workReviewRules"

// A book page's average rating and its readers' reviews. Ratings count every shared copy, anonymously,
// like the reader counts; review text only ever comes through visibleReview, so each reviewer's
// review visibility, private reviews and blocks hold here as they do on profiles and in the feed.

// Ceilings on rows read per request. Past them the average is over the newest ratings, which is fine.
const RATINGS_MAX = 20000
const REVIEWS_MAX = 500

export async function ratingSummaryForWork(workKey: string): Promise<RatingSummary | null> {
  const rows = await prisma.book.findMany({
    where: { rating: { gt: 0 }, AND: [await copiesOfWork(workKey), sharedBookWhere] },
    orderBy: { createdAt: "desc" },
    take: RATINGS_MAX,
    select: { userId: true, rating: true },
  })
  return summariseRatings(rows)
}

export async function reviewsForWork(workKey: string, viewerId: string | null, offset = 0): Promise<WorkReviewsPage> {
  const copies = await copiesOfWork(workKey)
  // The viewer's own review shows even on a private copy; everyone else's only on shared ones.
  const visibleCopies = viewerId ? { OR: [sharedBookWhere, { userId: viewerId }] } : sharedBookWhere
  const books = await prisma.book.findMany({
    where: { review: { not: null }, AND: [copies, visibleCopies] },
    orderBy: { createdAt: "desc" },
    take: REVIEWS_MAX,
    select: { id: true, userId: true, rating: true, review: true, reviewSpoiler: true, reviewPrivate: true, completedAt: true, createdAt: true },
  })

  const authorIds = Array.from(new Set(books.map((b) => b.userId)))
  const [blocked, follows, users] = await Promise.all([
    viewerId ? blockedUserIds(viewerId) : [],
    viewerId && authorIds.length
      ? prisma.follow.findMany({ where: { followerId: viewerId, followingId: { in: authorIds } }, select: { followingId: true } })
      : [],
    authorIds.length
      ? prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, username: true, image: true, favColour: true, ...booksReadCount, ...privacySelect, ...staffBadgeSelect },
        })
      : [],
  ])
  const blockedIds = new Set(blocked)
  const followed = new Set(follows.map((f) => f.followingId))
  const usersById = new Map(users.map((u) => [u.id, u]))

  // One review per reader: their newest copy that has one the viewer may read.
  const seen = new Set<string>()
  const shown = []
  for (const book of books) {
    const user = usersById.get(book.userId)
    if (!user || seen.has(book.userId) || blockedIds.has(book.userId)) continue
    const relation = { isSelf: book.userId === viewerId, isFollower: followed.has(book.userId), blocked: null }
    const visible = visibleReview(book, relation, privacyOf(user))
    if (!visible.review) continue
    seen.add(book.userId)
    shown.push({
      userId: book.userId,
      at: book.completedAt ?? book.createdAt,
      review: {
        id: book.id,
        person: { username: user.username, image: user.image, favColour: user.favColour, _count: user._count },
        staffBadge: staffBadgeOf(user),
        rating: book.rating,
        review: visible.review,
        reviewSpoiler: visible.reviewSpoiler,
        reviewHidden: visible.reviewHidden,
        isMine: relation.isSelf,
        at: (book.completedAt ?? book.createdAt).toISOString(),
      },
    })
  }

  const ordered = orderReviews(shown, viewerId, followed)
  const start = Math.max(0, offset)
  const end = start + REVIEWS_PAGE
  return {
    reviews: ordered.slice(start, end).map((r) => r.review),
    total: ordered.length,
    nextOffset: end < ordered.length ? end : null,
  }
}
