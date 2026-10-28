"use client"
import { FC } from 'react'
import type { Book } from '@prisma/client'
import FavouritesRow from './FavouritesRow'
import BooksInCommon, { useBooksInCommon } from './BooksInCommon'

interface ProfileShowcaseProps {
  username: string
  favourites: Book[]
  accentColour?: string | null
  // Signed in: Books in common needs someone to have books in common with.
  signedIn: boolean
}

// Near the top of someone else's profile: their favourites and the books you have in common. With both,
// they share a row from lg up, half each; with one, it has the full width. Stacked below lg.
const ProfileShowcase: FC<ProfileShowcaseProps> = ({ username, favourites, accentColour, signedIn }) => {
  const inCommon = useBooksInCommon(username, signedIn)
  const hasCommon = !!inCommon && inCommon.read.length + inCommon.wantToRead.length > 0
  const hasFavourites = favourites.length > 0
  const href = `/u/${encodeURIComponent(username)}/favourites`

  if (hasFavourites && hasCommon) {
    return (
      <div className="mb-12 grid gap-12 lg:grid-cols-2 lg:gap-10">
        <FavouritesRow books={favourites} href={href} readOnly half />
        {/* Wrapped, like the favourites, so its section is a first child and skips the top margin sections take. */}
        <div><BooksInCommon data={inCommon} accentColour={accentColour} half /></div>
      </div>
    )
  }
  if (hasCommon) return <div className="mb-12"><BooksInCommon data={inCommon} accentColour={accentColour} /></div>
  return <FavouritesRow books={favourites} href={href} readOnly />
}

export default ProfileShowcase
