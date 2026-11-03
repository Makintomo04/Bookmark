"use client"
import { FC } from 'react'
import type { Book } from '@prisma/client'
import useBooks from '@/app/hooks/useBooks'
import useFavourite from '@/app/hooks/useFavourite'
import ProfileLists from '../discover/ProfileLists'
import FavouritesRow, { FavouritesRowSkeleton } from './FavouritesRow'

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
// `half`: no margin of its own, where its container spaces it (beside your header below lg).
export const ProfileFavourites: FC<{ half?: boolean }> = ({ half = false }) => {
  const { loading, pending, books, favs } = useFavouriteBooks()
  if (loading) return pending ? <FavouritesRowSkeleton /> : null
  return <FavouritesRow books={favs} href="/favourites" hintWhenEmpty={books.length > 0} half={half} />
}

// Your lists in bands, above the shelves, below lg (your favourites open the profile there: ProfileHead's `lead`).
// `column`: your header's column from lg up, under your reviews: two across.
const BandsShowcase: FC<{ username: string; column?: boolean }> = ({ username, column = false }) => {
  if (column) return <ProfileLists username={username} isSelf half />
  return <ProfileLists username={username} isSelf flush swipe />
}

export default BandsShowcase
