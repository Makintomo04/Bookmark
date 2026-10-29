"use client"
import { FC, useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Maximize2 } from 'lucide-react'
import { fetcher, swrOptions } from '@/lib/fetcher'
import type { WorkReviewsPage } from '@/lib/workReviewRules'
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
import ModalSeries from '../series/ModalSeries'

// "12 reviews", linking to them on the book's page: the reason most people open the page, so the panel says
// what's waiting there. Same request as the page's first page of reviews, so opening the page is quicker.
// Nothing until there's at least one the viewer may read.
const ReviewsLink: FC<{ bookKey: string; href: string; onNavigate: () => void }> = ({ bookKey, href, onNavigate }) => {
  const { data } = useSWR<WorkReviewsPage>(`/api/books/reviews?workKey=${encodeURIComponent(bookKey)}`, fetcher, swrOptions)
  if (!data?.total) return null
  return (
    <Link href={`${href}#reviews-heading`} onClick={onNavigate} className="w-fit text-sm font-medium underline decoration-neutral-400/60 underline-offset-4 transition hover:decoration-current">
      {data.total.toLocaleString('en-GB')} {data.total === 1 ? "review" : "reviews"}
    </Link>
  )
}

// A closer look at a book from Discover, search or a list, before deciding to shelve it. A book Open
// Library lacks (a Hardcover hit) has a page once it's in the catalogue, i.e. once someone has shelved
// it; until then there's no page to link to, and opening details doesn't file it.
const BookDetailsModal: FC = () => {
  const { isOpen, book, reason, onClose } = useBookDetailsModal()
  const bookKey = book ? bookKeyOf(book) : null
  const { description, headline: fetchedHeadline, isLoading } = useBookDescription(isOpen ? bookKey : null, isOpen ? book?.description : null, book)
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
      <div className="flex flex-col items-start">
        <BookCover
          book={{ title: book.title, author: book.author, coverImage: book.coverUrl || "", cardColour: null }}
          sizes="160px"
          className="w-[120px] sm:w-[160px] shadow-sm"
        />
      </div>
      <div className="min-w-0 flex flex-col gap-5">
        <div>
          {/* Visibly a link (not only on hover, which a phone doesn't have): naming a book is how people expect to open it. */}
          <p className="text-2xl font-bold leading-tight break-words">
            {pageHref
              ? <Link href={pageHref} onClick={onClose} className="underline decoration-neutral-400/50 decoration-2 underline-offset-[6px] transition hover:decoration-current">{book.title}</Link>
              : book.title}
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
        {pageHref && bookKey && <ReviewsLink bookKey={bookKey} href={pageHref} onNavigate={onClose} />}
        {/* What it feels like and what's in it, from readers who finished it. Warnings stay folded until tapped. */}
        <WorkTagsSummary tags={tags} />
        {/* People first: the curator who sent the reader here, then anyone they follow who picked it. */}
        {reason && <CuratorNote variant="full" reason={reason} />}
        <PickedByFollowing book={book} />
        {bookKey && !isLoading && !description ? (
          <p className="text-sm text-muted-foreground">We don&apos;t have a description for this book yet.</p>
        ) : (
          <BookBlurb description={description} headline={fetchedHeadline ?? book?.headline} isLoading={isLoading} />
        )}
        {bookKey && <ModalSeries bookKey={bookKey} onNavigate={onClose} />}
        {bookKey && <BookProblemReport key={bookKey} workKey={book.workKey} workId={book.workKey ? null : book.pageWorkId} />}
      </div>
    </div>
  ) : undefined

  return (
    <Modal
      title="Book details"
      // The way through to the book's page: the same place for every book, beside close, as a peek panel's
      // "open as page" is. Icon-only on a phone, where the header is narrow.
      headerAction={pageHref ? (
        <Link href={pageHref} onClick={onClose} aria-label="Open book page"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-neutral-200 px-0 text-sm font-medium transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:w-9 sm:px-4 dark:bg-neutral-800 dark:hover:bg-neutral-700">
          <Maximize2 size={16} aria-hidden />
          <span className="hidden sm:inline">Open book page</span>
        </Link>
      ) : undefined}
      body={body}
      onClose={onClose}
      isOpen={isOpen}
      compact
    />
  )
}

export default BookDetailsModal
