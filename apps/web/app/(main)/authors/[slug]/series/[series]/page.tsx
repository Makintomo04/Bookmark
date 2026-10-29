import { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import Container, { PAGE_TOP } from '@/app/components/Container'
import SeriesBooks from '@/app/components/series/SeriesBooks'
import FollowSeriesButton from '@/app/components/series/FollowSeriesButton'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { findAuthor } from '@/lib/authors'
import { authorHref, authorSlug } from '@/lib/authorNames'
import { progressLabel, seriesHref, seriesSlug } from '@/lib/series'
import { authorSeriesBySlug, seriesOnPage } from '@/lib/seriesFollows'
import { can } from '@/lib/roles'

interface PageProps {
  params: Promise<{ slug: string, series: string }>
}

const decode = (param: string) => {
  try {
    return decodeURIComponent(param)
  } catch {
    return param
  }
}

async function findSeriesPage(params: Awaited<PageProps['params']>, userId: string | null) {
  const author = await findAuthor(decode(params.slug))
  if (!author) return null
  const series = await authorSeriesBySlug(author, decode(params.series), userId)
  return series && { author, series }
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const found = await findSeriesPage(params, null)
  if (!found) return {}
  const { name, author } = found.series
  return {
    title: `${name} by ${author}`,
    description: `The ${name} books by ${author} in reading order, on Bookmark.`,
  }
}

// A series' own page, from its author's page: its books in reading order, each ready to shelve, and
// Follow series. Open to everyone; signed in, it marks where the reader is.
const Page = async (props: PageProps) => {
  const params = await props.params;
  const slug = decode(params.slug)
  const seriesParam = decode(params.series)
  // A hand-typed or old link goes to the one canonical address.
  if (authorSlug(slug) !== slug || seriesSlug(seriesParam) !== seriesParam) {
    redirect(`/authors/${encodeURIComponent(authorSlug(slug))}/series/${seriesSlug(seriesParam)}`)
  }
  const user = await getCurrentUser()
  const found = await findSeriesPage(params, user?.id ?? null)
  if (!found) notFound()
  const { author, series } = found
  const track = await seriesOnPage(series, user?.id ?? null)
  const progress = track.started ? progressLabel(track) : null
  const known = track.entries.length === 1 ? "1 book on Bookmark" : `${track.entries.length} books on Bookmark`

  return (
    <div className={PAGE_TOP}>
      <Container width="content" className="flex flex-col gap-8">
        <div>
          <Link href={authorHref(author.slug)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft size={16} aria-hidden />{author.name}
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">Series</p>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <h1 className="page-title">{track.name}</h1>
            <FollowSeriesButton
              name={track.name}
              author={track.author}
              initialFollowing={track.following}
              signedIn={!!user}
              returnTo={seriesHref(track.name, track.author)}
              className="shrink-0"
            />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            By <Link href={authorHref(track.author)} className="text-foreground hover:underline underline-offset-2">{track.author}</Link>
            {" · "}{known}
            {progress && <> · <span className="tabular-nums">{track.finished ? "All read" : progress}</span></>}
          </p>
          {/* Librarians only: places, name and books in one go (/staff/catalogue/series). */}
          {can(user, 'catalogue.edit') && (
            <Link href={`/staff/catalogue/series?name=${encodeURIComponent(track.name)}`}
              className="mt-1 inline-flex min-h-11 pointer-fine:min-h-0 items-center text-sm text-brand-text hover:underline">
              Edit series
            </Link>
          )}
        </div>
        <SeriesBooks track={track} />
      </Container>
    </div>
  )
}

export default Page
