"use client"
import { FC } from 'react'
import { SWRConfig } from 'swr'
import { Book } from '@prisma/client'
import { privacyOf, visibleReview, type Relation } from '@/lib/privacyRules'
import useBooks from '@/app/hooks/useBooks'
import useUser from '@/app/hooks/useUser'
import ProfileHead from './ProfileHead'
import ProfileReviews from './ProfileReviews'
import BookList from '../books/BookList'
import ProfileLists from '../discover/ProfileLists'
import FollowRequests from './FollowRequests'

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

// Your own profile: editable, so it stays client-side, but starts from server data.
const OwnerProfile: FC<OwnerProfileProps> = ({ username, fallback }) => (
  <SWRConfig value={{ fallback }}>
    <ProfileHead />
    <div className="mt-12 px-4 sm:px-8">
      <FollowRequests className="mb-10" />
      <BookList />
      <OwnReviews />
      <ProfileLists username={username} isSelf />
    </div>
  </SWRConfig>
)

export default OwnerProfile
