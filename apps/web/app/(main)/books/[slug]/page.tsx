import { Suspense } from 'react'
import { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import BookCover from '@/app/components/cards/BookCover'
import BookCrumbs from '@/app/components/books/BookCrumbs'
import AuthorLink from '@/app/components/AuthorLink'
import AddToShelfButton from '@/app/components/discover/AddToShelfButton'
import BookBlurb from '@/app/components/books/BookBlurb'
import BookMoreMenu from '@/app/components/books/BookMoreMenu'
import BookPageReaders from '@/app/components/books/BookPageReaders'
import RatingSummary from '@/app/components/books/RatingSummary'
import BookReviews from '@/app/components/books/BookReviews'
import BookProblemReport from '@/app/components/books/BookProblemReport'
import BuyLinks from '@/app/components/books/BuyLinks'
import AdSlot from '@/app/components/ads/AdSlot'
import SeriesSection, { SeriesEyebrow } from '@/app/components/series/SeriesSection'
import ListCard from '@/app/components/discover/ListCard'
import SimilarAuthors from '@/app/components/books/SimilarAuthors'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { withoutEmphasis } from '@/lib/emphasis'
import { AuthorSections, AuthorSectionsSkeleton, MoreRowSkeleton, ReadersAlsoLiked } from '@/app/components/books/BookPageMore'
import { bookPageData } from '@/lib/bookPage'
import { listsWithBook } from '@/lib/bookLists'
import { BOOK_LISTS_SHOWN } from '@/lib/bookListRules'
import { seriesOnPage } from '@/lib/seriesFollows'
import { similarAuthors } from '@/lib/similarAuthors'
import { ratingSummaryForWork, reviewsForWork } from '@/lib/workReviews'
import { bookHref, bookKeyOfSlug, bookSlug } from '@/lib/workKey'
import { publishedFact } from '@bookmark/shared/releases'

interface PageProps {
  params: Promise<{ slug: string }>
}

const slugOf = (param: string) => {
  try {
    return decodeURIComponent(param)
  } catch {
    return param
  }
}

const DESCRIPTION_MAX = 160

// One heading style for every section on the page.
const sectionHeading = "font-display text-xl font-semibold"
// Each section below the title sits on the page itself, under a hairline rule: the space and the rule do the
// grouping, so the page reads as one calm column rather than a stack of cards.
const panel = "border-t border-border pt-6 sm:pt-8"

const summaryOf = (text: string) => {
  const flat = withoutEmphasis(text).replace(/\s+/g, " ").trim()
  if (flat.length <= DESCRIPTION_MAX) return flat
  const cut = flat.slice(0, DESCRIPTION_MAX - 1)
  return `${cut.slice(0, cut.lastIndexOf(" ")) || cut}…`
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const bookKey = bookKeyOfSlug(slugOf(params.slug))
  const data = bookKey ? await bookPageData(bookKey) : null
  if (!data) return { title: "Book not found", robots: { index: false } }

  const { book } = data
  const title = `${book.title} by ${book.author}`
  const description = data.description
    ? summaryOf(data.description)
    : `What readers think of ${book.title} by ${book.author}, on Bookmark.`
  const url = bookHref(book)!
  const images = book.coverUrl ? [{ url: book.coverUrl, alt: `Cover of ${book.title}` }] : undefined
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "book", title, description, url, siteName: "Bookmark", images },
    twitter: { card: "summary", title, description, images: book.coverUrl ? [book.coverUrl] : undefined },
  }
}

// A book's own page: everything book details shows, with room for the description, the Bookmark
// rating and every review the viewer may read. Keyed by the Open Library work key, or the catalogue
// Work's id for a book Open Library lacks (lib/bookPage.ts); the title in the address is cosmetic, and a
// stale or missing one redirects to the current.
const Page = async (props: PageProps) => {
  const params = await props.params;
  const slug = slugOf(params.slug)
  const bookKey = bookKeyOfSlug(slug)
  if (!bookKey) notFound()
  const data = await bookPageData(bookKey)
  if (!data) notFound()
  if (slug !== bookSlug(data.key, data.book.title)) redirect(bookHref(data.book)!)

  const viewer = await getCurrentUser()
  const { book, series, genres, key } = data
  const [rating, reviews, seriesTrack, onLists, similar] = await Promise.all([
    ratingSummaryForWork(key),
    reviewsForWork(key, viewer?.id ?? null),
    series ? seriesOnPage(series, viewer?.id ?? null) : null,
    // One more than shown, so "See all" only appears when there's more to see.
    listsWithBook(book.workKey, viewer, BOOK_LISTS_SHOWN + 1),
    similarAuthors({ bookKey: key, workId: data.workId, authors: data.authors, subjects: data.subjects }),
  ])
  const lists = onLists.slice(0, BOOK_LISTS_SHOWN)
  const moreShown = [book, ...(seriesTrack?.entries ?? [])]
  const href = bookHref(book)!
  const published = publishedFact(book, new Date().toISOString().slice(0, 10))
  const meta = [published && `${published.label} ${published.value}`, book.pages && `${book.pages} pages`].filter(Boolean).join(" · ")

  return (
    <div className="mt-6 sm:mt-8">
      <Container className="flex flex-col gap-10">
        <BookCrumbs homeHref={viewer?.username ? `/u/${encodeURIComponent(viewer.username)}` : "/"} />

        <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)] md:gap-12 lg:gap-16">
          {/* The cover stays in view beside a long page, so the left column isn't empty below it. */}
          <div className="md:sticky md:top-24 self-start">
            <BookCover
              book={{ title: book.title, author: book.author, coverImage: book.coverUrl || "", cardColour: null }}
              sizes="(min-width: 768px) 220px, 160px"
              className="w-[160px] md:w-full shadow-sm"
            />
            {/* Where to buy it, under the cover from md up. On a phone the cover sits above the title, so it
                follows About this book in the column instead. */}
            <div className="mt-6 hidden md:block">
              <BuyLinks book={book} workId={data.workId} id="buy-heading-side" headingClassName="text-sm font-semibold" />
            </div>
          </div>

          {/* The title block, then each section under its rule, with room between them. */}
          <div className="min-w-0 max-w-3xl flex flex-col gap-8 sm:gap-10">
            <header>
              {series && <p className="mb-2"><SeriesEyebrow name={series.name} position={series.position} /></p>}
              {/* display-m, the book as the page's subject: smaller than a page title, a step up from md. */}
              <h1 className="font-display text-[26px] leading-8 font-semibold tracking-[-0.01em] [text-wrap:balance] break-words md:text-[30px] md:leading-9">{book.title}</h1>
              <p className="mt-2 text-base"><AuthorLink author={book.author} /></p>
              {meta && <p className="mt-1 text-sm text-muted-foreground">{meta}</p>}
              {/* One thing to do here, the shelf; circles, sending and lists wait in the "…" menu. Full width
                  on a phone, where it's under the thumb. */}
              <div className="mt-6 flex items-center gap-2 sm:max-w-xs">
                <AddToShelfButton book={book} size="lg" className="flex-1" />
                <BookMoreMenu book={book} bookKey={key} />
              </div>
            </header>

            {seriesTrack && (
              <div className={panel}>
                <SeriesSection
                  track={seriesTrack}
                  workId={data.workId}
                  position={series?.position ?? null}
                  signedIn={!!viewer}
                  returnTo={href}
                  headingClassName={sectionHeading}
                />
              </div>
            )}

            <section aria-labelledby="about-heading" className={`${panel} flex flex-col gap-4`}>
              <h2 id="about-heading" className={sectionHeading}>About this book</h2>
              {data.description
                ? <BookBlurb description={data.description} headline={data.headline} isLoading={false} hideHeading className="max-w-2xl" />
                : <p className="text-sm text-muted-foreground">We don&apos;t have a description for this book yet.</p>}
              {genres.length > 0 && (
                <ul aria-label="Genres" className="flex flex-wrap gap-1.5">
                  {genres.map((genre) => (
                    <li key={genre.slug}>
                      <Link href={`/discover/genre/${genre.slug}`} className="inline-block rounded-full border border-neutral-300 dark:border-neutral-700 px-3 py-1 text-xs font-medium hover:bg-neutral-200 dark:hover:bg-neutral-800">
                        {genre.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className={`${panel} empty:hidden md:hidden`}><BuyLinks book={book} workId={data.workId} headingClassName={sectionHeading} /></div>

            {/* The author, briefly, with a way to their page, then their other books. Streamed in, and the row
                leaves out this book and the series above, which already lists those. */}
            <Suspense fallback={<AuthorSectionsSkeleton credit={book.author} headingClassName={sectionHeading} panelClassName={panel} />}>
              <AuthorSections book={book} shown={moreShown} headingClassName={sectionHeading} panelClassName={panel} />
            </Suspense>

            <div className={`${panel} flex flex-col gap-8 empty:hidden`}>
              <RatingSummary summary={rating} />
              <BookPageReaders book={book} bookKey={key} />
            </div>

            <AdSlot placement="book-page" viewer={viewer} className={panel} />

            <div className={panel}><BookReviews bookKey={key} initial={reviews} headingClassName={sectionHeading} /></div>

            {/* What readers shelve alongside this one, by other authors. */}
            <Suspense fallback={<MoreRowSkeleton heading="Readers also liked" headingClassName={sectionHeading} panelClassName={panel} />}>
              <ReadersAlsoLiked book={book} shown={moreShown} headingClassName={sectionHeading} panelClassName={panel} />
            </Suspense>

            {lists.length > 0 && (
              <section aria-labelledby="lists-heading" className={`${panel} flex flex-col gap-4`}>
                <div className="flex items-baseline justify-between gap-4">
                  <h2 id="lists-heading" className={sectionHeading}>On readers&apos; lists</h2>
                  {onLists.length > BOOK_LISTS_SHOWN && (
                    <Link href={`${href}/lists`} className="text-sm font-medium text-brand-text hover:underline underline-offset-2">See all</Link>
                  )}
                </div>
                {/* A row to swipe through on a phone; a grid once there's room. */}
                <div className="-mx-4 px-4 flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-5 overflow-x-auto sm:overflow-visible snap-x snap-mandatory pb-2">
                  {lists.map((list) => <ListCard key={list.id} list={list} className="w-56 shrink-0 sm:w-auto snap-start" />)}
                </div>
              </section>
            )}

            {similar.length > 0 && <div className={panel}><SimilarAuthors authors={similar} headingClassName={sectionHeading} /></div>}

            <section aria-labelledby="details-heading" className={`${panel} flex flex-col gap-4`}>
              <h2 id="details-heading" className={sectionHeading}>Details</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-1.5 text-sm">
                {published && <><dt className="text-muted-foreground">{published.label}</dt><dd>{published.value}</dd></>}
                {book.pages && <><dt className="text-muted-foreground">Pages</dt><dd>{book.pages}</dd></>}
                {data.editionCount ? <><dt className="text-muted-foreground">Editions</dt><dd>{data.editionCount.toLocaleString('en-GB')}</dd></> : null}
              </dl>
              <div className="flex flex-col items-start gap-3">
                <BookProblemReport workKey={book.workKey} workId={data.workId} />
              </div>
            </section>
          </div>
        </div>
      </Container>
    </div>
  )
}

export default Page
