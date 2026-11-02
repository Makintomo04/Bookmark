import { FC } from 'react'
import Link from 'next/link'
import type { DiscoverBook } from '@/lib/openLibrary'
import { sameBook } from '@/lib/workKey'
import { authorHref, authorNames, authorSlug, creditIncludes, isLinkableAuthor } from '@/lib/authorNames'
import { authorAbout, authorBooksPage, findAuthor } from '@/lib/authors'
import { readersAlsoLiked } from '@/lib/similarBooks'
import BookCover from '../cards/BookCover'
import { bookHref } from '@/lib/workKey'
import AuthorBrief from './AuthorBrief'
import { Skeleton } from '../ui/skeleton'

// "About {author}", "More by …" and "Readers also liked" on a book page (BOO-92). The two rows are just covers and titles,
// each a link to that book's page, where the shelf and list buttons are: one row to swipe on a phone, three
// across from sm, four from xl. Server components, streamed in behind Suspense, since Open Library and
// Hardcover can take a few seconds. A row with too little to show isn't drawn.

export const MORE_SHOWN = 4
const ROW = "-mx-4 px-4 flex sm:grid sm:grid-cols-3 xl:grid-cols-4 gap-4 overflow-x-auto sm:overflow-visible snap-x snap-mandatory scroll-px-4 pb-2 sm:[&>*:nth-child(4)]:hidden xl:[&>*:nth-child(4)]:flex"
const CARD = "flex w-32 shrink-0 snap-start sm:w-auto"

type Shown = Pick<DiscoverBook, "title" | "author" | "workKey">

// Shaped like a row of DiscoverBookCards, under the section's real heading, so the page doesn't jump.
export const MoreRowSkeleton: FC<{ heading: string, headingClassName: string, panelClassName: string }> = ({ heading, headingClassName, panelClassName }) => (
  <section className={`${panelClassName} flex flex-col gap-4`} aria-busy="true">
    <h2 className={headingClassName}>{heading}</h2>
    <div className={ROW} aria-hidden>
      {Array.from({ length: MORE_SHOWN }, (_, i) => (
        <div key={i} className={`${CARD} flex flex-col gap-2.5`}>
          <Skeleton className="aspect-[2/3] w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  </section>
)

// A cover and its title as one link to the book's page.
const CoverLink: FC<{ book: DiscoverBook }> = ({ book }) => (
  <Link
    href={bookHref(book)!}
    className="group flex w-full min-w-0 flex-col gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  >
    <BookCover
      book={{ title: book.title, author: book.author, coverImage: book.coverUrl || "", cardColour: null }}
      sizes="(min-width: 1280px) 180px, (min-width: 640px) 25vw, 128px"
      className="shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md"
    />
    <span className="flex min-w-0 flex-col">
      <span className="text-sm font-semibold leading-snug line-clamp-2 group-hover:underline underline-offset-2">{book.title}</span>
      <span className="truncate text-xs text-muted-foreground">{book.author}</span>
    </span>
  </Link>
)

const Row: FC<{ id: string, heading: string, books: DiscoverBook[], seeAll?: string, headingClassName: string, panelClassName: string }> = ({ id, heading, books, seeAll, headingClassName, panelClassName }) => (
  <section aria-labelledby={id} className={`${panelClassName} flex flex-col gap-4`}>
    <div className="flex items-baseline justify-between gap-4">
      <h2 id={id} className={headingClassName}>{heading}</h2>
      {seeAll && <Link href={seeAll} className="text-sm font-medium text-brand-text hover:underline underline-offset-2">See all</Link>}
    </div>
    <ul className={ROW}>
      {books.map((book, i) => <li key={book.workKey ?? book.hardcoverId ?? i} className={CARD}><CoverLink book={book} /></li>)}
    </ul>
  </section>
)

// Not this book, not one the series section already shows, and only books with a page to open.
const notShown = (books: DiscoverBook[], shown: Shown[]) => books.filter((b) => bookHref(b) && !shown.some((s) => sameBook(s, b)))

// The credit's first real author ("Unknown" and the like have no page), whose books the row shows.
const leadAuthor = (credit: string) => authorNames(credit).find(isLinkableAuthor)
export const moreByHeading = (credit: string) => { const name = leadAuthor(credit); return name ? `More by ${name}` : null }

// Placeholders for both author sections, under their real headings, while Open Library answers. The two
// share one rule on the page: they're both about the author.
export const AuthorSectionsSkeleton: FC<{ credit: string, headingClassName: string, panelClassName: string }> = ({ credit, headingClassName, panelClassName }) => {
  const name = leadAuthor(credit)
  if (!name) return null
  return (
    <div className={`${panelClassName} flex flex-col gap-8`}>
      <section className="flex flex-col gap-4" aria-busy="true">
        <h2 className={headingClassName}>About {name}</h2>
        <div className="flex items-start gap-4">
          <Skeleton className="size-16 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2"><Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-2/3" /></div>
        </div>
      </section>
      <MoreRowSkeleton heading={`More by ${name}`} headingClassName={headingClassName} panelClassName="" />
    </div>
  )
}

// The first named author: a short "About" with a link to their page, then their other books, most read
// first, as on that page. One lookup of the author serves both.
export async function AuthorSections({ book, shown, headingClassName, panelClassName }: { book: Shown, shown: Shown[], headingClassName: string, panelClassName: string }) {
  const name = leadAuthor(book.author)
  if (!name) return null
  const author = await findAuthor(authorSlug(name))
  if (!author) return null
  const [{ books }, about] = await Promise.all([
    authorBooksPage(author).catch(() => ({ books: [] as DiscoverBook[] })),
    authorAbout(author).catch(() => null),
  ])
  // Their own books: an anthology they're one contributor to is credited to its editor. And, for an author
  // who writes in English, only books known to be in English: Open Library lists some translations
  // (Jonathan Strange ve Bay Norrell) with no language at all, which the author page's tidying can't catch.
  const english = books.some((b) => b.languages?.includes("eng"))
  const own = books.filter((b) => creditIncludes(b.author, author.slug) && (!english || b.languages?.includes("eng")))
  const picks = notShown(own, shown).slice(0, MORE_SHOWN)
  return (
    <div className={`${panelClassName} flex flex-col gap-8`}>
      <AuthorBrief name={name} href={authorHref(name)} photoUrl={about?.photoUrl ?? null} bio={about?.bio[0] ?? null} headingClassName={headingClassName} className="" />
      {picks.length > 0 && <Row id="more-by-heading" heading={moreByHeading(book.author)!} books={picks} seeAll={authorHref(name)} headingClassName={headingClassName} panelClassName="" />}
    </div>
  )
}

// The books readers shelve alongside this one (Hardcover's list), by other authors.
export async function ReadersAlsoLiked({ book, shown, headingClassName, panelClassName }: { book: Shown, shown: Shown[], headingClassName: string, panelClassName: string }) {
  const picks = notShown(await readersAlsoLiked(book.title, book.author), shown)
  if (picks.length === 0) return null
  return <Row id="also-liked-heading" heading="Readers also liked" books={picks} headingClassName={headingClassName} panelClassName={panelClassName} />
}
