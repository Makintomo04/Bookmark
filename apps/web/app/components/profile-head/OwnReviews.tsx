"use client"
import { FC } from 'react'
import { Book } from '@prisma/client'
import { privacyOf, visibleReview, type Relation } from '@/lib/privacyRules'
import useBooks from '@/app/hooks/useBooks'
import useUser from '@/app/hooks/useUser'
import ProfileReviews from './ProfileReviews'

const SELF: Relation = { isSelf: true, isFollower: false, blocked: null }

// Your reviews, from your own shelf so an edit shows up straight away. Each one says when
// nobody else can see it. Finished books only, matching what your public profile shows.
const OwnReviews: FC<{ first?: number }> = ({ first }) => {
  const { user } = useUser()
  const { books } = useBooks()
  if (!user || !books) return null
  const privacy = privacyOf(user)
  const reviewed = (books as Book[])
    .filter((b) => b.status === "COMPLETED")
    .map((b) => ({ ...b, completedAt: b.completedAt ? String(b.completedAt) : null, ...visibleReview(b, SELF, privacy) }))
  return <ProfileReviews books={reviewed} accentColour={user.favColour} title="Your reviews" href={`/u/${encodeURIComponent(user.username)}/reviews`} collapsible first={first} />
}

export default OwnReviews
