import { Metadata } from 'next'
import Link from 'next/link'
import Container from '@/app/components/Container'
import ListCard from '@/app/components/discover/ListCard'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { GENRES, genreBySlug } from '@/lib/genres'
import { communityGenres, findLists } from '@/lib/lists'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: "Lists from readers",
  description: "Lists made by the Bookmark community, newest first.",
}

const chip = "h-8 inline-flex items-center px-3 rounded-full border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const Page = async (props: { searchParams: Promise<{ genre?: string }> }) => {
  const searchParams = await props.searchParams
  const viewer = await getCurrentUser()
  const genre = typeof searchParams.genre === "string" ? genreBySlug(searchParams.genre) : undefined
  const [lists, used] = await Promise.all([
    findLists({ community: true, genre: genre?.slug, limit: 48 }, viewer),
    communityGenres(),
  ])
  // The chosen genre stays in the row even if its last list goes, so the empty state below still makes sense.
  const genres = GENRES.filter((g) => used.has(g.slug) || g.slug === genre?.slug)

  return (
    <div className="mt-8 sm:mt-12">
      <Container className="flex flex-col gap-8">
        <div>
          <h1 className="page-title">Lists from readers</h1>
          <p className="mt-1 text-muted-foreground">
            Lists made by the Bookmark community, most recently updated first. Looking for something specific? <Link href="/discover" className="font-medium text-foreground underline underline-offset-4">Search Discover</Link>.
          </p>
        </div>

        {genres.length > 0 && <nav aria-label="Filter by genre" className="flex flex-wrap gap-2">
          <Link
            href="/lists"
            aria-current={!genre ? "page" : undefined}
            className={cn(chip, !genre ? "bg-foreground text-background border-foreground" : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900")}
          >
            All
          </Link>
          {genres.map((g) => (
            <Link
              key={g.slug}
              href={`/lists?genre=${g.slug}`}
              aria-current={genre?.slug === g.slug ? "page" : undefined}
              className={cn(chip, genre?.slug === g.slug ? "bg-foreground text-background border-foreground" : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900")}
            >
              {g.label}
            </Link>
          ))}
        </nav>}

        {lists.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            {lists.map((list) => <ListCard key={list.id} list={list} />)}
          </div>
        ) : (
          <p className="text-muted-foreground">
            {genre ? <>No {genre.label} lists yet. <Link href="/lists" className="font-medium text-foreground underline underline-offset-4">See all lists</Link>.</> : "No lists yet."}
          </p>
        )}
      </Container>
    </div>
  )
}

export default Page
