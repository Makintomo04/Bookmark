"use client"
import { FC } from 'react'
import useSWR, { SWRConfig } from 'swr'
import { Book } from '@prisma/client'
import { privacyOf, visibleReview, type Relation } from '@/lib/privacyRules'
import useBooks from '@/app/hooks/useBooks'
import useUser from '@/app/hooks/useUser'
import ProfileHead from './ProfileHead'
import ProfileReviews from './ProfileReviews'
import BookList from '../books/BookList'
import ProfileLists from '../discover/ProfileLists'
import FollowRequests from './FollowRequests'
import ProfileAuthors from './ProfileAuthors'
import type { FollowedAuthor } from '@/lib/authorFollows'
import { fetcher, swrOptions } from '@/lib/fetcher'

interface OwnerProfileProps {
  username: string
  // SWR keys the server already has answers for, so the header renders on the first paint
  // instead of behind a loader. Everything still revalidates on mount.
  fallback: Record<string, unknown>
}

const SELF: Relation = { isSelf: true, isFollower: false, blocked: null }

// Your reviews, from your own shelf so an edit shows up straight away. Each one says when
// nobody else can see it. Finished books only, matching what your public profile shows.
const OwnReviews: FC = () => {
  const { user } = useUser()
  const { books } = useBooks()
  if (!user || !books) return null
  const privacy = privacyOf(user)
  const reviewed = (books as Book[])
    .filter((b) => b.status === "COMPLETED")
    .map((b) => ({ ...b, completedAt: b.completedAt ? String(b.completedAt) : null, ...visibleReview(b, SELF, privacy) }))
  return <ProfileReviews books={reviewed} accentColour={user.favColour} title="Your reviews" />
}

// The authors you follow, from your own list so an unfollow elsewhere shows on the next visit.
const OwnAuthors: FC = () => {
  const { data } = useSWR<{ authors: FollowedAuthor[] }>('/api/user/authors', fetcher, swrOptions)
  if (!data) return null
  return <div className="mt-12"><ProfileAuthors authors={data.authors} isSelf /></div>
}

// Your own profile: editable, so it stays client-side, but starts from server data.
const OwnerProfile: FC<OwnerProfileProps> = ({ username, fallback }) => (
  <SWRConfig value={{ fallback }}>
    <ProfileHead />
    <div className="mt-12 px-4 sm:px-8">
      <FollowRequests className="mb-10" />
      <BookList />
      <OwnReviews />
      <ProfileLists username={username} isSelf />
      <OwnAuthors />
    </div>
  </SWRConfig>
)

export default OwnerProfile
