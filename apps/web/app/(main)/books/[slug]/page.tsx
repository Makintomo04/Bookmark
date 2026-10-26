import { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import Container from '@/app/components/Container'
import BookCover from '@/app/components/cards/BookCover'
import AuthorLink from '@/app/components/AuthorLink'
import AddToShelfButton from '@/app/components/discover/AddToShelfButton'
import AddToListButton from '@/app/components/discover/AddToListButton'
import StartCircleButton from '@/app/components/buddy-reads/StartCircleButton'
import BookBlurb from '@/app/components/books/BookBlurb'
import BookPageReaders from '@/app/components/books/BookPageReaders'
import RatingSummary from '@/app/components/books/RatingSummary'
import BookReviews from '@/app/components/books/BookReviews'
import BookProblemReport from '@/app/components/books/BookProblemReport'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { bookPageData } from '@/lib/bookPage'
import { ratingSummaryForWork, reviewsForWork } from '@/lib/workReviews'
import { bookHref, bookSlug, normaliseWorkKey } from '@/lib/workKey'

interface PageProps {
  params: { slug: string }
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

const summaryOf = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= DESCRIPTION_MAX) return flat
  const cut = flat.slice(0, DESCRIPTION_MAX - 1)
  return `${cut.slice(0, cut.lastIndexOf(" ")) || cut}…`
}

// "Empyrean #1", or just the series name when the position isn't known.
const seriesLabel = (series: { name: string, position: number | null }) =>
  series.position != null ? `${series.name} #${series.position}` : series.name

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const workKey = normaliseWorkKey(slugOf(params.slug))
  const data = workKey ? await bookPageData(workKey) : null
  if (!workKey || !data) return { title: "Book not found", robots: { index: false } }

  const { book } = data
  const title = `${book.title} by ${book.author}`
  const description = data.description
    ? summaryOf(data.description)
    : `What readers think of ${book.title} by ${book.author}, on Bookmark.`
  const url = bookHref({ workKey, title: book.title })!
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
// rating and every review the viewer may read. Keyed by the Open Library work key; the title in the
// address is cosmetic, and a stale or missing one redirects to the current.
const Page = async ({ params }: PageProps) => {
  const slug = slugOf(params.slug)
  const workKey = normaliseWorkKey(slug)
  if (!workKey) notFound()
  const data = await bookPageData(workKey)
  if (!data) notFound()
  if (slug !== bookSlug(workKey, data.book.title)) redirect(bookHref({ workKey, title: data.book.title })!)

  const viewer = await getCurrentUser()
  const [rating, reviews] = await Promise.all([
    ratingSummaryForWork(workKey),
    reviewsForWork(workKey, viewer?.id ?? null),
  ])
  const { book, series, genres } = data
  const meta = [book.year && `First published ${book.year}`, book.pages && `${book.pages} pages`].filter(Boolean).join(" · ")

  return (
    <div className="mt-6 sm:mt-8">
      <Container className="flex flex-col gap-10">
        <Link href="/discover" className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft size={16} aria-hidden />Discover
        </Link>

        <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)] md:gap-12 lg:gap-16">
          {/* The cover stays in view beside a long page, so the left column isn't empty below it. */}
          <div className="md:sticky md:top-24 self-start">
            <BookCover
              book={{ title: book.title, author: book.author, coverImage: book.coverUrl || "", cardColour: null }}
              sizes="(min-width: 768px) 220px, 160px"
              className="w-[160px] md:w-full shadow-sm"
            />
          </div>

          {/* Four groups, each with room around it: the book, what readers think, what it's about, and
              the reviews and details. Inside a group things sit close; between groups, a clear break. */}
          <div className="min-w-0 max-w-3xl flex flex-col gap-12 md:gap-14">
            <header>
              {series && <p className="mb-1 text-sm text-muted-foreground">{seriesLabel(series)}</p>}
              <h1 className="page-title break-words">{book.title}</h1>
              <p className="mt-2 text-base"><AuthorLink author={book.author} /></p>
              {meta && <p className="mt-1 text-sm text-muted-foreground">{meta}</p>}
              <div className="mt-6 flex flex-wrap items-center gap-1.5">
                <AddToShelfButton book={book} />
                <StartCircleButton book={book} />
                <AddToListButton book={book} />
              </div>
            </header>

            <div className="flex flex-col gap-8 empty:hidden">
              <RatingSummary summary={rating} />
              <BookPageReaders book={book} />
            </div>

            <section aria-labelledby="about-heading" className="flex flex-col gap-4">
              <h2 id="about-heading" className={sectionHeading}>About this book</h2>
              {data.description
                ? <BookBlurb description={data.description} isLoading={false} hideHeading className="max-w-2xl" />
                : <p className="text-sm text-muted-foreground">We don&apos;t have a description for this book yet.</p>}
              {genres.length > 0 && (
                <ul aria-label="Genres" className="flex flex-wrap gap-1.5">
                  {genres.map((genre) => (
                    <li key={genre.slug}>
                      <Link href={`/discover/genre/${genre.slug}`} className="inline-block rounded-full border border-neutral-300 dark:border-neutral-700 px-3 py-1 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-900">
                        {genre.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <BookReviews workKey={workKey} initial={reviews} headingClassName={sectionHeading} />

            <section aria-labelledby="details-heading" className="flex flex-col gap-4">
              <h2 id="details-heading" className={sectionHeading}>Details</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-1.5 text-sm">
                {book.year && <><dt className="text-muted-foreground">First published</dt><dd>{book.year}</dd></>}
                {book.pages && <><dt className="text-muted-foreground">Pages</dt><dd>{book.pages}</dd></>}
                {data.editionCount ? <><dt className="text-muted-foreground">Editions</dt><dd>{data.editionCount.toLocaleString('en-GB')}</dd></> : null}
              </dl>
              <div className="flex flex-col items-start gap-3">
                <a
                  href={`https://openlibrary.org/works/${workKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  View on Open Library<ExternalLink size={13} aria-hidden />
                </a>
                <BookProblemReport workKey={workKey} />
              </div>
            </section>
          </div>
        </div>
      </Container>
    </div>
  )
}

export default Page
