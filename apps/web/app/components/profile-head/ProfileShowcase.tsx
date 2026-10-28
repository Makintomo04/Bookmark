"use client"
import { FC } from 'react'
import type { Book } from '@prisma/client'
import FavouritesRow from './FavouritesRow'
import ProfileLists from '../discover/ProfileLists'
import { useOwnerLists } from '@/app/hooks/useLists'

interface ProfileShowcaseProps {
  username: string
  favourites: Book[]
}

// Near the top of someone else's profile: their favourites and their lists, the two things they've picked
// out to show. With both, they share a row from lg up, half each; with one, it has the full width. Stacked
// below lg.
const ProfileShowcase: FC<ProfileShowcaseProps> = ({ username, favourites }) => {
  // The same request ProfileLists makes, so this only decides the layout.
  const { lists } = useOwnerLists(username)
  const hasFavourites = favourites.length > 0
  const href = `/u/${encodeURIComponent(username)}/favourites`

  if (hasFavourites && lists.length > 0) {
    return (
      <div className="mb-12 grid gap-12 lg:grid-cols-2 lg:gap-10">
        <FavouritesRow books={favourites} href={href} readOnly half />
        {/* Wrapped, like the favourites, so its section is a first child and skips the top margin sections take. */}
        <div><ProfileLists username={username} isSelf={false} half /></div>
      </div>
    )
  }
  if (lists.length > 0) return <div className="mb-12"><ProfileLists username={username} isSelf={false} half /></div>
  return <FavouritesRow books={favourites} href={href} readOnly />
}

export default ProfileShowcase
