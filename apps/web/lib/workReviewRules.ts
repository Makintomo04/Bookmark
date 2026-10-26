import type { Curator } from "./listRules"

// A book page's ratings and reviews: the summary and the order reviews are listed in, with no database
// access, so tests and the client can import them. lib/workReviews.ts queries and re-exports these.

export const REVIEWS_PAGE = 10

export interface RatingSummary {
  average: number
  count: number
  // Readers per star, index 0 = one star … 4 = five stars.
  stars: [number, number, number, number, number]
}

export interface WorkReview {
  id: string
  person: Curator
  rating: number | null
  review: string
  reviewSpoiler: boolean
  // Only the viewer's own review can be one only they see.
  reviewHidden: boolean
  isMine: boolean
  at: string
}

export interface WorkReviewsPage {
  reviews: WorkReview[]
  total: number
  nextOffset: number | null
}

type Rated = { userId: string, rating: number | null }

// One rating per reader (the first given: callers pass newest first), averaged to one decimal place.
// Quarter-star ratings fall into the nearest whole star for the bars. null when nobody has rated it.
export function summariseRatings(rows: Rated[]): RatingSummary | null {
  const byReader = new Map<string, number>()
  for (const { userId, rating } of rows) {
    if (rating == null || rating <= 0 || byReader.has(userId)) continue
    byReader.set(userId, rating)
  }
  if (byReader.size === 0) return null
  const stars: RatingSummary["stars"] = [0, 0, 0, 0, 0]
  let total = 0
  for (const rating of Array.from(byReader.values())) {
    total += rating
    stars[Math.min(5, Math.max(1, Math.round(rating))) - 1]++
  }
  return { average: Math.round((total / byReader.size) * 10) / 10, count: byReader.size, stars }
}

type Orderable = { userId: string, at: Date }

// The viewer's own review first, then people they follow, then everyone else; newest first within each.
export function orderReviews<T extends Orderable>(reviews: T[], viewerId: string | null, followed: Set<string>): T[] {
  const rank = (r: T) => (r.userId === viewerId ? 0 : followed.has(r.userId) ? 1 : 2)
  return [...reviews].sort((a, b) => rank(a) - rank(b) || b.at.getTime() - a.at.getTime())
}
