import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import Container from '@/app/components/Container'
import ListCard from '@/app/components/discover/ListCard'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { genreBySlug } from '@/lib/genres'
import { allGenreCommunityLists } from '@/lib/genreLists'

interface PageProps {
  params: { slug: string }
}

export function generateMetadata({ params }: PageProps): Metadata {
  const genre = genreBySlug(params.slug)
  if (!genre) return {}
  return {
    title: `Readers' ${genre.label.toLowerCase()} lists`,
    description: `${genre.label} lists made by readers on Bookmark.`,
  }
}

// Every reader's public list in a genre, not just the few on the genre's page: editors' choices first,
// then newest. lib/genreListRules.ts explains the genre page's picks.
const Page = async ({ params }: PageProps) => {
  const genre = genreBySlug(params.slug)
  if (!genre) notFound()

  const lists = await allGenreCommunityLists(genre.slug, await getCurrentUser())

  return (
    <div className="mt-6 sm:mt-8">
      <Container className="flex flex-col gap-6">
        <div>
          <Link href={`/discover/genre/${genre.slug}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft size={16} aria-hidden />{genre.label}
          </Link>
          <h1 className="page-title mt-3">Readers&apos; {genre.label.toLowerCase()} lists</h1>
          <p className="mt-2 text-muted-foreground">Made by people on Bookmark. Editors&apos; choices first, then the newest.</p>
        </div>
        {lists.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-muted-foreground">
            No one has made a {genre.label.toLowerCase()} list yet. Tag one of yours with {genre.label} and it&apos;ll show here.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {lists.map((list) => <ListCard key={list.id} list={list} />)}
          </div>
        )}
      </Container>
    </div>
  )
}

export default Page
