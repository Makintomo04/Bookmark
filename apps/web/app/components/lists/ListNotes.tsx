"use client"
import { FC } from 'react'
import Link from 'next/link'
import { readerName } from '@/lib/profile'
import BookCover from '../cards/BookCover'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'
import type { DiscoverBook } from '@/lib/openLibrary'
import type { Reason } from '@/lib/listRules'
import { CuratorAvatar } from './CuratorNote'

export interface ListNote {
  rank: number
  book: DiscoverBook
  reason: Reason
  // The note came with a remix, so it's someone other than the list owner's words.
  borrowed: boolean
}

// A list's notes gathered under its grid, numbered to match the covers above, so the grid stays a
// clean run of books and the reasons read together like the curator's commentary.
// The book's details open without the note: it's already on the page.
const ListNotes: FC<{ notes: ListNote[] }> = ({ notes }) => {
  const openDetails = useBookDetailsModal((s) => s.onOpen)
  if (notes.length === 0) return null

  return (
    <section aria-labelledby="list-notes-heading" className="flex flex-col gap-4">
      <h2 id="list-notes-heading" className="text-lg font-semibold">Why they made the list</h2>
      <ol className="grid lg:grid-cols-2 gap-x-10 border-t border-neutral-200 dark:border-neutral-800">
        {notes.map(({ rank, book, reason, borrowed }) => (
          <li key={rank} className="flex gap-4 py-5 border-b border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => openDetails(book)}
              aria-label={`About ${book.title} by ${book.author}`}
              className="relative w-12 shrink-0 self-start rounded-md transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <BookCover
                book={{ title: book.title, author: book.author, coverImage: book.coverUrl || "", cardColour: null }}
                variant="thumb"
                sizes="48px"
              />
              <span className="absolute -left-2 -top-2 grid size-6 place-items-center rounded-full bg-background text-[11px] font-semibold tabular-nums shadow ring-1 ring-neutral-200 dark:ring-neutral-800">{rank}</span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm min-w-0 truncate">
                <button type="button" onClick={() => openDetails(book)} className="font-semibold hover:underline underline-offset-2">{book.title}</button>
                <span className="text-muted-foreground"> · {book.author}</span>
              </p>
              <blockquote className="mt-1.5 font-display text-[15px] leading-relaxed text-foreground/90 whitespace-pre-line">
                {reason.text}
              </blockquote>
              {borrowed && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CuratorAvatar person={reason.by} size={16} />
                  <span className="min-w-0 truncate">
                    Kept from{" "}
                    {reason.by.username
                      ? <Link href={`/u/${reason.by.username}`} className="font-medium text-foreground hover:underline underline-offset-2">{readerName(reason.by)}</Link>
                      : "another reader"}
                    &rsquo;s original list
                  </span>
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default ListNotes
