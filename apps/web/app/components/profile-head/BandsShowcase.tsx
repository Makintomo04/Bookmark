"use client"
import { FC } from 'react'
import type { Book } from '@prisma/client'
import useBooks from '@/app/hooks/useBooks'
import useFavourite from '@/app/hooks/useFavourite'
import ProfileLists from '../discover/ProfileLists'
import FavouritesRow, { FavouritesRowSkeleton } from './FavouritesRow'
import UpNext from './UpNext'

// Your own favourites as books, newest first, once the shelf they're drawn from has loaded.
const useFavouriteBooks = () => {
  const { books } = useBooks()
  const { favourites } = useFavourite()
  if (!Array.isArray(books)) return { loading: true, pending: (favourites as string[]).length > 0, books: [] as Book[], favs: [] as Book[] }
  const byId = new Map((books as Book[]).map((b) => [b.id, b]))
  return { loading: false, pending: false, books: books as Book[], favs: (favourites as string[]).slice().reverse().flatMap((id) => byId.get(id) ?? []) }
}

// Your favourites in your header's right column, above what you're reading: four to a row, in covers larger than
// Up next's (BooksTop, from lg up).
// With no favourites yet but books on your shelf, the same spot holds the heading and how to add one.
export const ProfileFavourites: FC = () => {
  const { loading, pending, books, favs } = useFavouriteBooks()
  if (loading) return pending ? <FavouritesRowSkeleton /> : null
  return <FavouritesRow books={favs} href="/favourites" hintWhenEmpty={books.length > 0} />
}

// Your favourites and lists in bands, above the shelves.
// `column`: your header's right column from lg up, where the favourites sit above what you're reading
// (ProfileFavourites) and this is what's under it: Up next (three) beside your lists, or your lists alone.
const BandsShowcase: FC<{ username: string; column?: boolean; withUpNext?: boolean }> = ({ username, column = false, withUpNext = false }) => {
  const { loading, pending, books, favs } = useFavouriteBooks()
  if (loading && !column) return pending ? <FavouritesRowSkeleton /> : null
  if (column) {
    return withUpNext ? (
      <div className="grid grid-cols-2 items-start gap-10">
        <UpNext cap={3} />
        <ProfileLists username={username} isSelf half />
      </div>
    ) : <ProfileLists username={username} isSelf flush />
  }
  return (
    <div className="flex flex-col gap-12">
      {/* `half`: no margin of its own, as the gap here spaces it. */}
      <FavouritesRow books={favs} href="/favourites" hintWhenEmpty={books.length > 0} half />
      <ProfileLists username={username} isSelf flush swipe />
    </div>
  )
}

export default BandsShowcase
