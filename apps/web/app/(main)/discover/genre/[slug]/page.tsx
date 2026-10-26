import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import Container from '@/app/components/Container'
import GenreBooks from '@/app/components/discover/GenreBooks'
import ListCard from '@/app/components/discover/ListCard'
import { GenreArt } from '@/app/components/discover/GenreTile'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { genreBackground, genreBySlug } from '@/lib/genres'
import { findLists } from '@/lib/lists'
import { genreCommunityLists } from '@/lib/genreLists'
import { trendingSubjectBooks } from '@/lib/openLibrary'
import { readableInk } from '@/lib/colour'

interface PageProps {
  params: { slug: string }
}

export function generateMetadata({ params }: PageProps): Metadata {
  const genre = genreBySlug(params.slug)
  if (!genre) return {}
  return {
    title: `${genre.label} books`,
    description: `Trending ${genre.label.toLowerCase()} books and hand-picked ${genre.label.toLowerCase()} lists on Bookmark.`,
  }
}

const Page = async ({ params }: PageProps) => {
  const genre = genreBySlug(params.slug)
  if (!genre) notFound()

  const viewer = await getCurrentUser()
  const [picks, community, books] = await Promise.all([
    findLists({ pick: true, genre: genre.slug, limit: 8 }, viewer),
    genreCommunityLists(genre.slug, viewer),
    trendingSubjectBooks(genre.subject).catch(() => []),
  ])
  // Team picks lead, then readers' lists: editors' choices, then the best of the rest.
  const lists = [...picks, ...community]

  return (
    <div className="mt-6 sm:mt-8">
      <Container className="flex flex-col gap-10">
        <div>
          <Link href="/discover" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft size={16} aria-hidden />Discover
          </Link>
          {/* Same look as the Discover tile, scaled up, using this page's own top covers. */}
          <div className="group relative mt-3 flex h-32 sm:h-40 items-end overflow-hidden rounded-2xl p-6 sm:p-8" style={{ background: genreBackground(genre.colour), color: readableInk(genre.colour) }}>
            <GenreArt genre={genre} size="hero" covers={books.map((b) => b.coverUrl).filter((url): url is string => !!url).slice(0, 3)} />
            <h1 className="page-title relative z-10 drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]">{genre.label}</h1>
          </div>
        </div>

        {lists.length === 0 && (
          <Link href={`/discover/genre/${genre.slug}/lists`} className="-mt-4 self-start text-sm font-medium text-brand-text hover:underline underline-offset-2">Readers&apos; {genre.label.toLowerCase()} lists</Link>
        )}
        {lists.length > 0 && (
          <section aria-labelledby="lists-heading">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="lists-heading" className="text-xl font-bold">Lists</h2>
              <Link href={`/discover/genre/${genre.slug}/lists`} className="text-sm font-medium text-brand-text hover:underline underline-offset-2">All readers&apos; lists</Link>
            </div>
            <div className="mt-4 -mx-4 px-4 flex sm:grid sm:grid-cols-3 lg:grid-cols-4 gap-5 overflow-x-auto sm:overflow-visible snap-x snap-mandatory pb-2">
              {lists.map((list) => <ListCard key={list.id} list={list} className="w-60 shrink-0 sm:w-auto snap-start" />)}
            </div>
          </section>
        )}

        <section aria-labelledby="trending-heading">
          <h2 id="trending-heading" className="text-xl font-bold">Trending in {genre.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Most read this week.</p>
          <div className="mt-4">
            <GenreBooks slug={genre.slug} initial={books} />
          </div>
        </section>
      </Container>
    </div>
  )
}

export default Page
