"use client"
import { FC, useEffect, useState } from 'react'
import { SWRConfig } from 'swr'
import { Book } from '@prisma/client'
import { privacyOf, visibleReview, type Relation } from '@/lib/privacyRules'
import useBooks from '@/app/hooks/useBooks'
import useUser from '@/app/hooks/useUser'
import useSettings from '@/app/hooks/useSettings'
import { notify } from '@/lib/notify'
import ProfileHead from './ProfileHead'
import ProfileReviews from './ProfileReviews'
import BookList from '../books/BookList'
import ProfileLists from '../discover/ProfileLists'
import GenrePicks from '../discover/GenrePicks'
import { GENRE_PICKS_SHELF_LIMIT } from '@/lib/genres'
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

// Somewhere to start while your shelf is still new: popular books in the genres you picked at sign-up,
// above the shelves. Whether it shows is settled once per visit, so adding a few picks in a row doesn't
// pull it out from under you at the fifth; Hide always applies straight away (and sticks, across devices).
const NewShelfPicks: FC = () => {
  const { books } = useBooks()
  const { settings, save } = useSettings()
  const [isNew, setIsNew] = useState<boolean | null>(null)
  useEffect(() => {
    if (isNew === null && Array.isArray(books)) setIsNew(books.length < GENRE_PICKS_SHELF_LIMIT)
  }, [books, isNew])
  if (!isNew || !settings || settings.hideShelfPicks) return null

  const hide = () => {
    save("hideShelfPicks", true)
    notify.success("Suggestions hidden", { description: "They're still on Discover, and you can bring them back in Settings." })
  }
  return <GenrePicks placement="shelf" className="mb-12" onHide={hide} />
}

// Your own profile: editable, so it stays client-side, but starts from server data.
const OwnerProfile: FC<OwnerProfileProps> = ({ username, fallback }) => (
  <SWRConfig value={{ fallback }}>
    <ProfileHead />
    <div className="mt-12 px-4 sm:px-8">
      <FollowRequests className="mb-10" />
      <NewShelfPicks />
      <BookList />
      <OwnReviews />
      <ProfileLists username={username} isSelf />
    </div>
  </SWRConfig>
)

export default OwnerProfile
