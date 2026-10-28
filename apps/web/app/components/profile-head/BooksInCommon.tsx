"use client"
import { FC, useState } from 'react'
import useSWR from 'swr'
import { Star } from 'lucide-react'
import { fetcher, swrOptions } from '@/lib/fetcher'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'
import type { BooksInCommon as InCommon, InCommonBook } from '@/app/api/users/[username]/in-common/route'
import { ShelfSection } from '../books/shelf'
import BookCover from '../cards/BookCover'
import { secondaryButtonClass } from './ProfileHeader'
import { cn } from '@/lib/utils'
import useShelfPreview from '@/app/hooks/useShelfPreview'

// Covers per group before "Show all": one row at the widest breakpoint, or four in half a wide screen.
const COLLAPSED = 8
const COLLAPSED_HALF = 4

const CommonCover: FC<{ book: InCommonBook; accentColour?: string | null }> = ({ book, accentColour }) => {
  const openDetails = useBookDetailsModal((s) => s.onOpen)
  return (
    <button
      type="button"
      onClick={() => openDetails({ workKey: book.workKey, title: book.title, author: book.author, pages: null, coverUrl: book.coverImage || null })}
      aria-label={`${book.title} by ${book.author}`}
      className="group flex flex-col gap-1.5 text-left rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <BookCover book={book} variant="thumb" sizes="(min-width: 768px) 110px, 22vw" className="transition group-hover:opacity-90" />
      <span title={book.title} className="text-xs font-medium leading-snug line-clamp-2">{book.title}</span>
      {book.rating ? (
        <span className="flex items-center gap-0.5 text-xs tabular-nums text-muted-foreground" aria-label={`They rated it ${book.rating}`}>
          <Star size={11} className="fill-current" aria-hidden />{book.rating}
        </span>
      ) : null}
    </button>
  )
}

const Group: FC<{ title: string; books: InCommonBook[]; expanded: boolean; collapsed: number; half: boolean; accentColour?: string | null }> = ({ title, books, expanded, collapsed, half, accentColour }) => {
  if (books.length === 0) return null
  const shown = expanded ? books : books.slice(0, collapsed)
  return (
    <div>
      <h3 className="mb-3 flex items-baseline gap-2 text-sm font-medium">
        {title}
        <span className="text-xs font-normal text-muted-foreground tabular-nums">{books.length}</span>
      </h3>
      <div className={cn("grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-x-3 sm:gap-x-4 gap-y-4", half && "lg:grid-cols-4")}>
        {shown.map((book) => <CommonCover key={book.workKey} book={book} accentColour={accentColour} />)}
      </div>
    </div>
  )
}

// Someone else's profile, for a signed-in viewer: the books you've both read and both want to read.
// The route applies blocks and the owner's privacy settings; anything it hides arrives empty.
// The books in common between the viewer and this reader (ProfileShowcase loads them).
export function useBooksInCommon(username: string, enabled = true) {
  return useSWR<InCommon>(enabled ? `/api/users/${encodeURIComponent(username)}/in-common` : null, fetcher, swrOptions).data
}

const BooksInCommon: FC<{ data: InCommon | undefined; accentColour?: string | null; half?: boolean }> = ({ data, accentColour, half = false }) => {
  const [expanded, setExpanded] = useState(false)
  const wide = useShelfPreview() >= 10
  const collapsed = half && wide ? COLLAPSED_HALF : COLLAPSED

  const read = data?.read ?? []
  const wantToRead = data?.wantToRead ?? []
  const total = read.length + wantToRead.length
  if (total === 0) return null

  const canExpand = read.length > collapsed || wantToRead.length > collapsed
  const toggle = canExpand ? (
    <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} className={secondaryButtonClass}>
      {expanded ? "Show less" : "Show all"}
    </button>
  ) : undefined

  return (
    <ShelfSection id="profile-in-common" title="Books in common" count={total} action={toggle}>
      <div className="flex flex-col gap-6">
        <Group title="You've both read" books={read} expanded={expanded} collapsed={collapsed} half={half} accentColour={accentColour} />
        <Group title="You both want to read" books={wantToRead} expanded={expanded} collapsed={collapsed} half={half} accentColour={accentColour} />
      </div>
    </ShelfSection>
  )
}

export default BooksInCommon
