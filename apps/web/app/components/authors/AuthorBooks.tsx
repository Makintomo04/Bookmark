"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import type { Book } from '@prisma/client'
import type { DiscoverBook } from '@/lib/openLibrary'
import type { Author, AuthorBooksPage } from '@/lib/authors'
import { creditIncludes } from '@/lib/authorNames'
import { sameBook } from '@/lib/workKey'
import useBooks from '@/app/hooks/useBooks'
import useUser from '@/app/hooks/useUser'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'
import BookCoverCard from '../cards/BookCoverCard'
import DiscoverBookCard from '../discover/DiscoverBookCard'

// The reader's own copies first (which works even when Open Library knows little of the author), then
// the rest of the author's books, most read first, ready to add.
const AuthorBooks: FC<{ author: Author, initial: AuthorBooksPage }> = ({ author, initial }) => {
  const { user } = useUser()
  const { books: shelf } = useBooks()
  const [books, setBooks] = useState(initial.books)
  const [nextOffset, setNextOffset] = useState(initial.nextOffset)
  const [isLoading, setIsLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const mine = (Array.isArray(shelf) ? (shelf as Book[]) : []).filter((b) => creditIncludes(b.author, author.slug))
  const more = books.filter((b) => !mine.some((m) => sameBook(m, b)))

  const loadMore = () => {
    setIsLoading(true)
    setFailed(false)
    axios.get(`/api/authors/${encodeURIComponent(author.slug)}?offset=${nextOffset}`)
      .then((res) => {
        const page: AuthorBooksPage = res.data
        if (page.failed && page.books.length === 0) throw new Error("Open Library failed")
        // The first page carries catalog books too, so later pages can repeat them.
        setBooks((current) => [...current, ...page.books.filter((b) => !current.some((c) => sameBook(c, b)))])
        setNextOffset(page.nextOffset)
      })
      .catch(() => setFailed(true))
      .finally(() => setIsLoading(false))
  }

  return (
    <div className="flex flex-col gap-10">
      {user?.id && mine.length > 0 && (
        <section aria-labelledby="mine-heading">
          <h2 id="mine-heading" className="text-lg font-semibold">On your shelf</h2>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-8">
            {mine.map((book) => <BookCoverCard key={book.id} book={book} accentColour={user.favColour} />)}
          </div>
        </section>
      )}

      <section aria-labelledby="more-heading">
        <h2 id="more-heading" className="text-lg font-semibold">{mine.length > 0 ? `More by ${author.name}` : `Books by ${author.name}`}</h2>
        {more.length > 0 ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">Most read first.</p>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-8">
              {more.map((book: DiscoverBook, i) => <DiscoverBookCard key={book.workKey ?? `${book.title}-${i}`} book={book} />)}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {initial.failed && books.length === 0
              ? <>We can&apos;t list {author.name}&apos;s books right now. Try again in a minute.</>
              : books.length > 0
                ? <>You&apos;ve shelved every book of theirs we could find.</>
                : <>We couldn&apos;t find any books by {author.name}.{" "}<Link href="/discover" className="font-medium text-foreground underline underline-offset-4">Search Discover</Link> for a title instead.</>}
          </p>
        )}
        {(nextOffset !== null || failed) && (
          <div className="mt-8 flex flex-col items-center gap-2">
            {failed && <p className="text-sm text-muted-foreground">Couldn&apos;t load more books.</p>}
            <button type="button" onClick={loadMore} disabled={isLoading} className={secondaryButtonClass}>
              {isLoading ? "Loading…" : failed ? "Try again" : "Show more"}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

export default AuthorBooks
