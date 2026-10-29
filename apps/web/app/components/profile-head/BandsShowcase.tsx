"use client"
import { FC } from 'react'
import { Bookmark } from 'lucide-react'
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
export const ProfileFavourites: FC = () => {
  const { loading, pending, favs } = useFavouriteBooks()
  if (loading) return pending ? <FavouritesRowSkeleton /> : null
  return favs.length > 0 ? <FavouritesRow books={favs} href="/favourites" collapsible /> : null
}

// Your favourites and lists in bands, above the shelves. With no favourites yet, the way to add one is a line
// under the lists' heading rather than a section of its own.
// `column`: your header's right column from lg up, where the favourites sit above what you're reading
// (ProfileFavourites) and this is what's under it: Up next (three) beside your lists, or your lists alone.
const BandsShowcase: FC<{ username: string; column?: boolean; withUpNext?: boolean }> = ({ username, column = false, withUpNext = false }) => {
  const { loading, pending, books, favs } = useFavouriteBooks()
  if (loading && !column) return pending ? <FavouritesRowSkeleton /> : null
  const hint = !loading && favs.length === 0 && books.length > 0 && (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Bookmark size={14} aria-hidden />No favourites yet. Use the bookmark on any cover to add one.</p>
  )
  if (column) {
    return withUpNext ? (
      <div className="grid grid-cols-2 items-start gap-10">
        <UpNext cap={3} />
        <ProfileLists username={username} isSelf half footnote={hint || undefined} />
      </div>
    ) : <ProfileLists username={username} isSelf flush footnote={hint || undefined} />
  }
  return (
    <div className="flex flex-col gap-12">
      {favs.length > 0 && <FavouritesRow books={favs} href="/favourites" collapsible />}
      <ProfileLists username={username} isSelf flush swipe footnote={hint || undefined} />
    </div>
  )
}

export default BandsShowcase
