import { Suspense } from 'react'
import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Container from '@/app/components/Container'
import GenreBooks, { GenreBooksSkeleton } from '@/app/components/discover/GenreBooks'
import GenreHeader from '@/app/components/discover/GenreHeader'
import ListCard from '@/app/components/discover/ListCard'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { genreBySlug } from '@/lib/genres'
import { findLists } from '@/lib/lists'
import { genreCommunityLists } from '@/lib/genreLists'
import { trendingSubjectBooks } from '@/lib/openLibrary'
import { withCatalogueFixesOrAsIs } from '@/lib/curatedBooks'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const genre = genreBySlug(params.slug)
  if (!genre) return {}
  return {
    title: `${genre.label} books`,
    description: `Trending ${genre.label.toLowerCase()} books and hand-picked ${genre.label.toLowerCase()} lists on Bookmark.`,
  }
}

// Open Library can take a few seconds when its answer isn't cached, so the trending books stream in
// behind a skeleton rather than holding up the header and lists.
const TrendingBooks = async ({ slug, subject }: { slug: string, subject: string }) => {
  const books = await withCatalogueFixesOrAsIs(await trendingSubjectBooks(subject).catch(() => []))
  return <GenreBooks slug={slug} initial={books} />
}

const Page = async (props: PageProps) => {
  const params = await props.params;
  const genre = genreBySlug(params.slug)
  if (!genre) notFound()

  const viewer = await getCurrentUser()
  const [picks, community] = await Promise.all([
    findLists({ pick: true, genre: genre.slug, limit: 8 }, viewer),
    genreCommunityLists(genre.slug, viewer),
  ])
  // Team picks lead, then readers' lists: editors' choices, then the best of the rest.
  const lists = [...picks, ...community]

  return (
    <div className="mt-6 sm:mt-8">
      <Container className="flex flex-col gap-10">
        <GenreHeader genre={genre} />

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
            <Suspense fallback={<GenreBooksSkeleton />}>
              <TrendingBooks slug={genre.slug} subject={genre.subject} />
            </Suspense>
          </div>
        </section>
      </Container>
    </div>
  )
}

export default Page
