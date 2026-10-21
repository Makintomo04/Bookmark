import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { booksReadOf, tierRingStyle } from '@/lib/readerTier'
import { notFound } from 'next/navigation'
import { EyeOff, Flag, Lock } from 'lucide-react'
import Container from '@/app/components/Container'
import DiscoverBookCard from '@/app/components/discover/DiscoverBookCard'
import PickBadge from '@/app/components/discover/PickBadge'
import EmbedListButton from '@/app/components/embed/EmbedListButton'
import { EditListButton, FollowButton, ReportListButton } from '@/app/components/discover/ListButtons'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { genreBySlug } from '@/lib/genres'
import { findList, toEditableList } from '@/lib/lists'

interface PageProps {
  params: { id: string }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const list = await findList(params.id, await getCurrentUser())
  if (!list) return {}
  return {
    title: list.title,
    description: list.description || `${list.items.length} books, curated ${list.isPick ? "by the Bookmark team" : `by ${list.owner.username}`}.`,
  }
}

const Page = async ({ params }: PageProps) => {
  const viewer = await getCurrentUser()
  const list = await findList(params.id, viewer)
  if (!list) notFound()

  const owner = list.owner
  const genres = list.genres.map(genreBySlug).filter(Boolean)

  return (
    <div className="mt-8 sm:mt-12">
      <Container className="flex flex-col gap-10">
        <header className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {list.isPick && <PickBadge />}
            {list.visibility === "PRIVATE" && <span className="inline-flex items-center gap-1"><Lock size={14} aria-hidden />Only you can see this</span>}
            {list.hidden && <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400"><EyeOff size={14} aria-hidden />Hidden</span>}
            {list.reportCount > 0 && <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400"><Flag size={14} aria-hidden />{list.reportCount} {list.reportCount === 1 ? "report" : "reports"}</span>}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0 max-w-3xl">
              <h1 className="text-3xl sm:text-4xl font-bold leading-tight break-words">{list.title}</h1>
              {list.description && <p className="mt-3 text-muted-foreground whitespace-pre-line">{list.description}</p>}
            </div>
            <div className="shrink-0 flex flex-wrap gap-2 empty:hidden">{list.canEdit && <EditListButton list={toEditableList(list)} />}{list.visibility === "PUBLIC" && !list.hidden && <EmbedListButton id={list.id} title={list.title} />}</div>
          </div>

          {(genres.length > 0 || list.tags.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {genres.map((g) => (
                <Link key={g!.slug} href={`/discover/genre/${g!.slug}`} className="h-7 inline-flex items-center px-3 rounded-full border border-neutral-300 dark:border-neutral-700 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-900">{g!.label}</Link>
              ))}
              {list.tags.map((tag) => (
                <span key={tag} className="h-7 inline-flex items-center px-3 rounded-full bg-neutral-100 dark:bg-neutral-900 text-xs font-medium">{tag}</span>
              ))}
            </div>
          )}

          {/* The curator is the way from a list to a person worth following. */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 sm:max-w-md">
            <Link href={`/u/${owner.username}`} className="flex items-center gap-3 min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="relative size-10 shrink-0 overflow-hidden rounded-[14px]" style={{ background: owner.favColour || "#D92D2D", ...tierRingStyle(booksReadOf(owner)) }}>
                <Image src={owner.image || "/images/avatar.jpg"} alt="" fill sizes="40px" className="object-cover" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Curated by</p>
                <p className="truncate font-medium">{owner.username}</p>
              </div>
            </Link>
            {!list.isOwner && owner.username && <FollowButton username={owner.username} initialFollowing={list.isFollowing} />}
          </div>
        </header>

        {list.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-muted-foreground">No books on this list yet.</p>
        ) : (
          <ol className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-10">
            {list.items.map((item, i) => (
              <li key={item.id} className="flex">
                <DiscoverBookCard
                  rank={i + 1}
                  note={item.note}
                  book={{ workKey: item.workKey, title: item.title, author: item.author, coverUrl: item.coverUrl, pages: item.pages }}
                />
              </li>
            ))}
          </ol>
        )}

        {!list.isOwner && !list.isPick && (
          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-6">
            <ReportListButton listId={list.id} initialReported={list.hasReported} />
          </div>
        )}
      </Container>
    </div>
  )
}

export default Page
