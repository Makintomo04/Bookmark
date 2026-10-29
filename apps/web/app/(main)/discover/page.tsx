import { Suspense } from 'react'
import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Feather } from 'lucide-react'
import Container from '@/app/components/Container'
import DiscoverSearch from '@/app/components/discover/DiscoverSearch'
import GenreTile from '@/app/components/discover/GenreTile'
import ListCard from '@/app/components/discover/ListCard'
import FollowingPicks from '@/app/components/discover/FollowingPicks'
import GenrePicks from '@/app/components/discover/GenrePicks'
import { NewPickButton } from '@/app/components/discover/ListButtons'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { GENRES, favouritesFirst } from '@/lib/genres'
import { findLists, ListSummary } from '@/lib/lists'
import { isOpenLibraryCover } from '@/utils/helpers'

export const metadata: Metadata = {
  title: "Discover",
  description: "Find your next read: browse genres, hand-picked lists from the Bookmark team, and readers with taste like yours.",
}

const Spotlight = ({ list }: { list: ListSummary }) => (
  <Link
    href={`/lists/${list.id}`}
    className="group relative flex flex-col sm:flex-row sm:items-center gap-6 overflow-hidden rounded-2xl bg-neutral-950 text-white p-6 sm:p-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  >
    <div className="relative z-10 min-w-0 flex-1">
      {list.featuredLabel && <p className="text-xs font-semibold uppercase tracking-widest text-white/70">{list.featuredLabel}</p>}
      <h2 className="mt-2 text-2xl sm:text-3xl font-bold leading-tight">{list.title}</h2>
      {list.description && <p className="mt-2 max-w-xl text-sm text-white/75 line-clamp-3">{list.description}</p>}
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium">
        See all {list.itemCount} books <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden />
      </span>
    </div>
    <div className="relative z-10 flex shrink-0 -space-x-6 sm:-space-x-8">
      {list.items.slice(0, 4).map((cover, i) => (
        <div key={i} className="relative aspect-[2/3] w-20 sm:w-28 overflow-hidden rounded-md bg-white/10 shadow-xl ring-1 ring-white/10 transition-transform group-hover:-translate-y-1" style={{ rotate: `${(i - 1.5) * 4}deg`, transitionDelay: `${i * 30}ms` }}>
          {cover.coverUrl && <Image src={cover.coverUrl} alt="" fill sizes="112px" unoptimized={isOpenLibraryCover(cover.coverUrl)} className="object-cover" />}
        </div>
      ))}
    </div>
  </Link>
)

// The way into Ask the shelf: a search the reader starts, never a feed of AI picks.
const AskShelfEntry = () => (
  <Link
    href="/discover/ask"
    className="group flex items-center gap-4 rounded-2xl border border-neutral-300 dark:border-neutral-700 p-5 transition hover:bg-neutral-50 dark:hover:bg-neutral-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  >
    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><Feather size={20} aria-hidden /></span>
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Ask the shelf</span>
        <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">AI search</span>
      </span>
      <span className="mt-0.5 block text-sm text-muted-foreground">Describe the read you&apos;re in the mood for, like &ldquo;cosy and low-stakes&rdquo; or &ldquo;fantasy under 400 pages&rdquo;. Your friends&apos; favourites come first.</span>
    </span>
    <ArrowRight size={18} aria-hidden className="shrink-0 transition-transform group-hover:translate-x-1" />
  </Link>
)

const Page = async () => {
  const viewer = await getCurrentUser()
  const [featured, picks, community, reported] = await Promise.all([
    findLists({ featured: true, limit: 1 }, viewer),
    findLists({ pick: true, limit: 12 }, viewer),
    findLists({ community: true, limit: 12 }, viewer),
    findLists({ reported: true, limit: 24 }, viewer),
  ])

  return (
    <div className="mt-8 sm:mt-12">
      <Container className="flex flex-col gap-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="page-title">Discover</h1>
            <p className="mt-1 text-muted-foreground">Find your next read, and the readers behind it.</p>
          </div>
          <NewPickButton />
        </div>

        <DiscoverSearch>
          <div className="flex flex-col gap-12">
            {featured[0] && <Spotlight list={featured[0]} />}
            <AskShelfEntry />

            <section aria-labelledby="genres-heading">
              <h2 id="genres-heading" className="text-xl font-bold">Browse by genre</h2>
              {/* Fifteen genres: rows of 3 or 5 come out even; on phones the last one spans the pair. */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
                {favouritesFirst(GENRES, viewer?.favGenres).map((genre) => <GenreTile key={genre.slug} genre={genre} />)}
              </div>
            </section>

            {/* Signed in with favourite genres: what readers shelve most in them. */}
            {viewer && <GenrePicks placement="discover" />}

            {/* Signed in: recent picks by people the reader follows, each with its reason. */}
            {viewer && (
              <Suspense fallback={null}>
                <FollowingPicks viewerId={viewer.id} />
              </Suspense>
            )}

            {picks.length > 0 && (
              <section aria-labelledby="picks-heading">
                <h2 id="picks-heading" className="text-xl font-bold">Bookmark Picks</h2>
                <p className="mt-1 text-sm text-muted-foreground">Lists put together by the Bookmark team.</p>
                {/* Scrolls sideways on phones; wraps into a grid with room to spare. */}
                <div className="mt-4 -mx-4 px-4 flex sm:grid sm:grid-cols-3 lg:grid-cols-4 gap-5 overflow-x-auto sm:overflow-visible snap-x snap-mandatory pb-2">
                  {picks.map((list) => <ListCard key={list.id} list={list} className="w-60 shrink-0 sm:w-auto snap-start" />)}
                </div>
              </section>
            )}

            {community.length > 0 && (
              <section aria-labelledby="community-heading">
                <h2 id="community-heading" className="text-xl font-bold">From readers</h2>
                <p className="mt-1 text-sm text-muted-foreground">Lists made by the Bookmark community. Like one? Follow the reader behind it.</p>
                <div className="mt-4 -mx-4 px-4 flex sm:grid sm:grid-cols-3 lg:grid-cols-4 gap-5 overflow-x-auto sm:overflow-visible snap-x snap-mandatory pb-2">
                  {community.map((list) => <ListCard key={list.id} list={list} className="w-60 shrink-0 sm:w-auto snap-start" />)}
                </div>
              </section>
            )}

            {/* Staff only: findLists returns nothing for anyone else. */}
            {reported.length > 0 && (
              <section aria-labelledby="review-heading" className="rounded-2xl border border-danger/30 p-5">
                <h2 id="review-heading" className="text-xl font-bold">Reported lists</h2>
                <p className="mt-1 text-sm text-muted-foreground">Lists with open reports, seen only by the Bookmark team. Deal with them in the <Link href="/staff/reports" className="font-medium text-foreground underline underline-offset-4">reports queue</Link>, so each report is closed and logged.</p>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                  {reported.map((list) => <ListCard key={list.id} list={list} />)}
                </div>
              </section>
            )}
          </div>
        </DiscoverSearch>
      </Container>
    </div>
  )
}

export default Page
