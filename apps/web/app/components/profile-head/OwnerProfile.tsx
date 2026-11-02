"use client"
import { FC, useEffect, useState } from 'react'
import { Bookmark } from 'lucide-react'
import useSWR, { SWRConfig } from 'swr'
import { Book } from '@prisma/client'
import useBooks from '@/app/hooks/useBooks'
import useUser from '@/app/hooks/useUser'
import useSettings from '@/app/hooks/useSettings'
import { notify } from '@/lib/notify'
import ProfileHead from './ProfileHead'
import OwnReviews from './OwnReviews'
import BandsShowcase from './BandsShowcase'
import BookList from '../books/BookList'
import FavouritesRow, { FavouritesRowSkeleton } from './FavouritesRow'
import useFavourite from '@/app/hooks/useFavourite'
import { useOwnerLists } from '@/app/hooks/useLists'
import ProfileLists from '../discover/ProfileLists'
import GenrePicks from '../discover/GenrePicks'
import { GENRE_PICKS_SHELF_LIMIT } from '@/lib/genres'
import FollowRequests from './FollowRequests'
import ProfileAuthors from './ProfileAuthors'
import SeriesTracker from '../series/SeriesTracker'
import type { FollowedAuthor } from '@/lib/authorFollows'
import { fetcher, swrOptions } from '@/lib/fetcher'
import { type ProfileLayout } from './Band'
import { ShelfFilterProvider } from '@/app/hooks/useShelfFilter'

interface OwnerProfileProps {
  username: string
  layout?: ProfileLayout
  // SWR keys the server already has answers for, so the header renders on the first paint
  // instead of behind a loader. Everything still revalidates on mount.
  fallback: Record<string, unknown>
}

// Your favourites and your lists, side by side from lg up when you have both (as others see on your
// profile); one alone takes the full width. Favourites come from your own shelf, so a bookmark tapped
// anywhere shows straight away. With no favourites yet (and a shelf to pick from), a line on how to add one.
const OwnShowcase: FC<{ username: string }> = ({ username }) => {
  const { user } = useUser()
  const { books } = useBooks()
  const { favourites } = useFavourite()
  const { lists } = useOwnerLists(username)
  if (!user) return null
  // Your favourite ids come with the page but the books behind them don't, so hold their place. With no
  // favourites, your lists don't need the shelf and can show straight away.
  if (!Array.isArray(books)) {
    if ((favourites as string[]).length > 0) return <FavouritesRowSkeleton />
    return lists.length > 0 ? <div className="mb-12"><ProfileLists username={username} isSelf flush /></div> : null
  }
  const byId = new Map((books as Book[]).map((b) => [b.id, b]))
  const favs = (favourites as string[]).slice().reverse().flatMap((id) => byId.get(id) ?? [])

  if (favs.length > 0 && lists.length > 0) {
    return (
      <div className="mb-12 grid gap-12 lg:grid-cols-2 lg:gap-10">
        <FavouritesRow books={favs} href="/favourites" half />
        <div><ProfileLists username={username} isSelf half /></div>
      </div>
    )
  }
  if (lists.length > 0) return <div className="mb-12"><ProfileLists username={username} isSelf flush /></div>
  return <FavouritesRow books={favs} href="/favourites" hintWhenEmpty={books.length > 0} />
}

// With no lists yet, "Make your first list" stays down the page rather than pushing the shelf down; once
// you have one, your lists sit at the top beside your favourites (OwnShowcase).
const OwnListsPrompt: FC<{ username: string }> = ({ username }) => {
  const { lists, isLoading, isError } = useOwnerLists(username)
  if (isLoading || (!isError && lists.length > 0)) return null
  return <ProfileLists username={username} isSelf />
}

// The authors you follow, from your own list so an unfollow elsewhere shows on the next visit.
const OwnAuthors: FC<{ cap?: number }> = ({ cap }) => {
  const { data } = useSWR<{ authors: FollowedAuthor[] }>('/api/user/authors', fetcher, swrOptions)
  if (!data) return null
  if (cap) return <ProfileAuthors authors={data.authors} isSelf cap={cap} />
  return <div className="mt-12"><ProfileAuthors authors={data.authors} isSelf /></div>
}

// How many reviews and followed authors show in bands before "Show more" and "+N more".
const BANDS_REVIEWS = 3
const BANDS_AUTHORS = 8

// Your profile in bands, as the reader panel and designer settled it (docs/profile-layout-spike.html,
// Iterations 2 and 3). Your header is a column from lg up with what you're reading and what's next beside it,
// and the shelf search at the top; its results open right under it, in place of what you're reading. Then your
// reviews beside the authors you follow, your favourites and lists, and your shelves as tabs. One filter serves
// the search, the results and the tabs.
const OwnerBands: FC<{ username: string }> = ({ username }) => (
  <ShelfFilterProvider>
    <ProfileHead layout="bands" />
    <div className="mt-10 flex flex-col gap-12 [&>*]:!mb-0">
      <FollowRequests />
      {/* From lg up your reviews are in your header's column too, under the authors you follow (ProfileHead). */}
      <div className="lg:hidden empty:hidden"><OwnReviews first={BANDS_REVIEWS} /></div>
      {/* From lg up your favourites and lists sit in your header's right column, under Up next (ProfileHead). */}
      <div className="lg:hidden"><BandsShowcase username={username} /></div>
      <BookList slot="shelves" />
      {/* From lg up the authors you follow are in your header's column, under your medals (ProfileHead); on a phone they come last. */}
      <div className="lg:hidden empty:hidden"><OwnAuthors cap={BANDS_AUTHORS} /></div>
    </div>
  </ShelfFilterProvider>
)

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
const OwnerProfile: FC<OwnerProfileProps> = ({ username, layout = 'bands', fallback }) => (
  <SWRConfig value={{ fallback }}>
    {layout === 'bands' ? <OwnerBands username={username} /> : <>
    <ProfileHead layout="classic" />
    <div className="mt-6 sm:mt-8">
      <FollowRequests className="mb-10" />
      <NewShelfPicks />
      <OwnShowcase username={username} />
      <BookList />
      <div className="mt-12"><SeriesTracker /></div>
      <OwnReviews />
      <OwnListsPrompt username={username} />
      <OwnAuthors />
    </div>
    </>}
  </SWRConfig>
)

export default OwnerProfile
