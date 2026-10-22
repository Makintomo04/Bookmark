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
import OwnQuestMedals from '../quests/OwnQuestMedals'
import ProfileThemeFrame from '../profile/ProfileThemeFrame'
import { personalisationOf } from '@/lib/personalisation'

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

// In your theme (Plus), read from your own user so a change in settings shows straight away.
const Themed: FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser()
  return <ProfileThemeFrame theme={personalisationOf(user ?? {}).profileTheme} accent={user?.favColour ?? null}>{children}</ProfileThemeFrame>
}

// Your own profile: editable, so it stays client-side, but starts from server data.
const OwnerProfile: FC<OwnerProfileProps> = ({ username, fallback }) => (
  <SWRConfig value={{ fallback }}>
    <Themed>
      <ProfileHead />
      <div className="mt-12 px-4 sm:px-8">
        <BookList />
        <OwnReviews />
        <OwnQuestMedals />
        <ProfileLists username={username} isSelf />
      </div>
    </Themed>
  </SWRConfig>
)

export default OwnerProfile
