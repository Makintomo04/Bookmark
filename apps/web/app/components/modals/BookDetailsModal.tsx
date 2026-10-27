"use client"
import { FC, useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import Modal from './Modal'
import BookCover from '../cards/BookCover'
import BookBlurb from '../books/BookBlurb'
import AddToShelfButton from '../discover/AddToShelfButton'
import AddToListButton from '../discover/AddToListButton'
import CuratorNote from '../lists/CuratorNote'
import PickedByFollowing from '../lists/PickedByFollowing'
import StartCircleButton from '../buddy-reads/StartCircleButton'
import { WorkTagsSummary } from '../books/WorkTags'
import ReaderCounts from '../books/ReaderCounts'
import useWorkTags from '@/app/hooks/useWorkTags'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'
import useBookDescription from '@/app/hooks/useBookDescription'
import useBookEntryModal from '@/app/hooks/useBookEntryModal'
import useListEditorModal from '@/app/hooks/useListEditorModal'
import AuthorLink from '@/app/components/AuthorLink'
import { bookHref, bookKeyOf } from '@/lib/workKey'
import BookProblemReport from '../books/BookProblemReport'

// A closer look at a book from Discover, search or a list, before deciding to shelve it. A book Open
// Library lacks (a Hardcover hit) has a page once it's in the catalogue, i.e. once someone has shelved
// it; until then there's no page to link to, and opening details doesn't file it.
const BookDetailsModal: FC = () => {
  const { isOpen, book, reason, onClose } = useBookDetailsModal()
  const bookKey = book ? bookKeyOf(book) : null
  const { description, isLoading } = useBookDescription(isOpen ? bookKey : null, isOpen ? book?.description : null, book)
  const { tags } = useWorkTags({ bookKey: isOpen ? bookKey : null })
  const pageHref = book ? bookHref(book) : null

  // The shelf and list buttons can hand off to their own modals; step aside rather than stack.
  const entryOpen = useBookEntryModal((s) => s.isOpen)
  const listEditorOpen = useListEditorModal((s) => s.isOpen)
  useEffect(() => {
    if (isOpen && (entryOpen || listEditorOpen)) onClose()
  }, [isOpen, entryOpen, listEditorOpen, onClose])

  const body = book ? (
    <div className="w-full self-start px-6 pb-2 grid gap-6 sm:grid-cols-[160px_1fr]">
      {/* The way through to the book's page sits under its cover. */}
      <div className="flex flex-col items-start gap-3">
        <BookCover
          book={{ title: book.title, author: book.author, coverImage: book.coverUrl || "", cardColour: null }}
          sizes="160px"
          className="w-[120px] sm:w-[160px] shadow-sm"
        />
        {pageHref && (
          <Link href={pageHref} onClick={onClose} className="w-[120px] sm:w-[160px] text-sm font-medium underline-offset-4 hover:underline">
            {/* Wraps at the cover's width, so the arrow runs with the text rather than sitting apart. */}
            See full page and reviews<ArrowRight size={14} aria-hidden className="ml-1 inline align-[-2px]" />
          </Link>
        )}
      </div>
      <div className="min-w-0 flex flex-col gap-5">
        <div>
          <p className="text-2xl font-bold leading-tight break-words">
            {pageHref ? <Link href={pageHref} onClick={onClose} className="hover:underline underline-offset-4">{book.title}</Link> : book.title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <AuthorLink author={book.author} onNavigate={onClose} />
            {[book.year, book.pages && `${book.pages} pages`].filter(Boolean).map((part) => ` · ${part}`).join("")}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <AddToShelfButton book={book} />
            <StartCircleButton book={book} />
            <AddToListButton book={book} />
          </div>
        </div>
        <ReaderCounts bookKey={bookKey} />
        {/* What it feels like and what's in it, from readers who finished it. Warnings stay folded until tapped. */}
        <WorkTagsSummary tags={tags} />
        {/* People first: the curator who sent the reader here, then anyone they follow who picked it. */}
        {reason && <CuratorNote variant="full" reason={reason} />}
        <PickedByFollowing book={book} />
        {bookKey && !isLoading && !description ? (
          <p className="text-sm text-muted-foreground">We don&apos;t have a description for this book yet.</p>
        ) : (
          <BookBlurb description={description} isLoading={isLoading} />
        )}
        {bookKey && <BookProblemReport key={bookKey} workKey={book.workKey} workId={book.workKey ? null : book.pageWorkId} />}
      </div>
    </div>
  ) : undefined

  return (
    <Modal
      title="Book details"
      body={body}
      onClose={onClose}
      isOpen={isOpen}
      compact
    />
  )
}

export default BookDetailsModal
