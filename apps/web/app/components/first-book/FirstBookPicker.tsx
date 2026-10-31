"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import axios from 'axios'
import { ArrowRight, BookOpen, Check, Compass, Feather, SlidersHorizontal } from 'lucide-react'
import { fetcher, swrOptions } from '@/lib/fetcher'
import { notify, apiError } from '@/lib/notify'
import type { DiscoverBook } from '@/lib/openLibrary'
import type { FirstBookPicks, StarterBook, StarterSection } from '@bookmark/shared/firstBook'
import { refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'
import FetchErrorState from '../FetchErrorState'
import { Skeleton } from '../ui/skeleton'
import BookCover from '../cards/BookCover'
import DiscoverBookCard from '../discover/DiscoverBookCard'
import { AiLabel } from '../discover/AskShelf'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'

const gridClass = "grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"

// The picker's sections (packages/shared/src/firstBook.ts), then the two ways on when none of them is it:
// Discover, and Ask the shelf, which is AI, so it's labelled and opt-in. Everything above it works without AI.
const FirstBookPicker: FC<{ profileHref: string }> = ({ profileHref }) => {
  const { data, error, mutate } = useSWR<FirstBookPicks>('/api/first-book', fetcher, swrOptions)

  if (error) return <FetchErrorState error={error} what="your suggestions" onRetry={() => mutate()} />
  if (!data) return <PickerSkeleton />

  return (
    <>
      {data.sections.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6">
          <p className="font-medium">Nothing to suggest yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.hasGenres ? "Follow a few readers, or browse Discover, and books will turn up here." : "Pick a few genres you like and the most popular books in them will show here."}
          </p>
          {!data.hasGenres && (
            <Link href="/settings#genres" className={`${secondaryButtonClass} mt-4`}><SlidersHorizontal size={14} aria-hidden />Pick genres</Link>
          )}
        </div>
      )}
      {data.sections.map((section) => <Section key={section.source} section={section} />)}
      {/* Genres skipped at sign-up: the popular row is the one most new readers can use, so say how to get it. */}
      {!data.hasGenres && data.sections.length > 0 && (
        <p className="-mt-4 text-sm text-muted-foreground">
          <Link href="/settings#genres" className="font-medium text-foreground underline-offset-4 hover:underline">Pick a few genres</Link> and the most popular books in them will show here too.
        </p>
      )}
      <WaysOn aiFeatures={data.aiFeatures} />
      <div>
        <Link href={profileHref} className={secondaryButtonClass}>Go to my shelf</Link>
      </div>
    </>
  )
}

const Section: FC<{ section: StarterSection }> = ({ section }) => (
  <section aria-labelledby={`first-book-${section.source}`}>
    <h2 id={`first-book-${section.source}`} className="text-xl font-bold">{section.heading}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{section.blurb}</p>
    <div className={`mt-4 ${gridClass}`}>
      {section.books.map((book) => (
        book.bookId
          ? <SavedBookCard key={book.key} book={book} />
          // The shelf button is AddToShelfButton: Want to read in one tap, or Reading from its menu.
          : <DiscoverBookCard key={book.key} book={book as DiscoverBook} context={<Why book={book} />} />
      ))}
    </div>
  </section>
)

const Why: FC<{ book: StarterBook }> = ({ book }) => {
  if (!book.why && !book.quote) return null
  return (
    <div className="-mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
      {book.why && <p className="line-clamp-2">{book.why}</p>}
      {book.quote && <p className="line-clamp-3 italic">&ldquo;{book.quote}&rdquo;</p>}
    </div>
  )
}

// A book already on Want to read: Start moves it to Reading in one tap, with Undo, as Up next does.
const SavedBookCard: FC<{ book: StarterBook }> = ({ book }) => {
  const openDetails = useBookDetailsModal((s) => s.onOpen)
  const [state, setState] = useState<'idle' | 'starting' | 'started'>('idle')
  const id = book.bookId!

  const start = async () => {
    setState('starting')
    try {
      await axios.post("/api/book-progress", { id, action: "start" })
    } catch (err) {
      setState('idle')
      return notify.error(apiError(err, `Couldn't start ${book.title}. Try again.`))
    }
    setState('started')
    refreshAfterBookChange()
    notify.success(`Started ${book.title}`, {
      description: "It's on your Reading shelf.",
      action: {
        label: "Undo",
        onClick: () => {
          axios.post("/api/book-progress", { id, action: "wantToRead" })
            .then(() => { setState('idle'); refreshAfterBookChange() })
            .catch((err) => notify.error(apiError(err, "Couldn't undo that")))
        },
      },
    })
  }

  return (
    <div className="flex flex-col gap-2.5 w-full min-w-0">
      <button
        type="button"
        onClick={() => openDetails(book as DiscoverBook)}
        aria-label={`About ${book.title} by ${book.author}`}
        className="group flex flex-col gap-2.5 min-w-0 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <BookCover
          book={{ title: book.title, author: book.author, coverImage: book.coverUrl || "", cardColour: null }}
          sizes="(min-width: 1024px) 180px, (min-width: 640px) 25vw, 45vw"
          className="shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-snug line-clamp-2 group-hover:underline underline-offset-2">{book.title}</span>
          <span className="block text-xs text-muted-foreground truncate">{book.author}</span>
        </span>
      </button>
      <div className="mt-auto">
        {state === 'started' ? (
          <span className="inline-flex h-8 items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400" aria-live="polite"><Check size={15} aria-hidden />Reading</span>
        ) : (
          <button type="button" onClick={start} disabled={state === 'starting'} aria-label={`Start reading ${book.title}`} className={`${primaryButtonClass} h-8 px-3 text-sm whitespace-nowrap`}>
            <BookOpen size={14} aria-hidden />{state === 'starting' ? 'Starting…' : 'Start'}
          </button>
        )}
      </div>
    </div>
  )
}

// Two ways on. Ask the shelf says it's AI before anyone clicks, and that it's off until they turn it on.
const WaysOn: FC<{ aiFeatures: boolean }> = ({ aiFeatures }) => (
  <section aria-labelledby="first-book-more" className="flex flex-col gap-3">
    <h2 id="first-book-more" className="text-xl font-bold">Not seeing it?</h2>
    <div className="grid gap-3 md:grid-cols-2">
      <WayOn href="/discover" icon={<Compass size={20} aria-hidden />} title="Browse Discover">
        Every genre, the team&apos;s lists and readers&apos; lists.
      </WayOn>
      <WayOn href="/discover/ask" icon={<Feather size={20} aria-hidden />} title="Ask the shelf" label={<AiLabel />}>
        Describe what you&apos;re in the mood for and AI turns it into a search of the catalogue.
        {aiFeatures ? "" : " It's off until you turn it on, and nothing above needs it."}
      </WayOn>
    </div>
  </section>
)

const WayOn: FC<{ href: string, icon: React.ReactNode, title: string, label?: React.ReactNode, children: React.ReactNode }> = ({ href, icon, title, label, children }) => (
  <Link
    href={href}
    className="group flex items-center gap-4 rounded-2xl border border-neutral-300 dark:border-neutral-700 p-5 transition hover:bg-neutral-50 dark:hover:bg-neutral-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  >
    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{title}</span>{label}</span>
      <span className="mt-0.5 block text-sm text-muted-foreground">{children}</span>
    </span>
    <ArrowRight size={18} aria-hidden className="shrink-0 transition-transform group-hover:translate-x-1" />
  </Link>
)

const PickerSkeleton = () => (
  <div className="flex flex-col gap-10" aria-busy="true" aria-label="Loading suggestions">
    {[0, 1].map((s) => (
      <div key={s}>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        <div className={`mt-4 ${gridClass}`}>
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[2/3] w-full rounded-md" />)}
        </div>
      </div>
    ))}
  </div>
)

export default FirstBookPicker
