import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Container from '@/app/components/Container'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { getWrapped, getWrappedOwner, getWrappedYears, isWrappedPublic, parseWrappedYear } from '@/lib/stats'
import { canViewUser } from '@/lib/privacy'
import WrappedView from '@/app/components/wrapped/WrappedView'
import { ACCENT_SCOPE, accentVars, readerAccent } from '@/app/components/stats/accent'

interface PageProps {
  params: { username: string; year: string }
}

const plural = (n: number, one: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : `${one}s`}`

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const year = parseWrappedYear(params.year)
  const owner = year ? await getWrappedOwner(params.username) : null
  if (!year || !owner || !(await isWrappedPublic(owner))) return { title: 'Wrapped not found', robots: { index: false } }

  const w = await getWrapped(owner.id, year, null, { sharedOnly: true })
  const title = `${owner.username}'s ${year} in books`
  const description = w.books
    ? `${owner.username} finished ${plural(w.books, 'book')} and ${plural(w.pages, 'page')} in ${year}${w.topGenre ? `, mostly ${w.topGenre.name}` : ''}. See their Bookmark Wrapped.`
    : `${owner.username}'s ${year} on Bookmark.`
  const url = `/u/${encodeURIComponent(owner.username)}/wrapped/${year}`

  // The share image comes from ./opengraph-image and ./twitter-image.
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', title, description, url, siteName: 'Bookmark' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function Page({ params }: PageProps) {
  const year = parseWrappedYear(params.year)
  if (!year) notFound()
  const [owner, viewer] = await Promise.all([getWrappedOwner(params.username), getCurrentUser()])
  if (!owner) notFound()
  const own = viewer?.id === owner.id
  if (!own && !(await canViewUser(viewer?.id, owner.id, 'profile'))) notFound()

  // Private books are the owner's alone, so anyone else sees the year without them.
  const sharedOnly = !own
  const [wrapped, years] = await Promise.all([getWrapped(owner.id, year, null, { sharedOnly }), getWrappedYears(owner.id, { sharedOnly })])
  const accent = readerAccent(owner.favColour)

  return (
    <div className={`mt-6 sm:mt-10 ${ACCENT_SCOPE}`} style={accentVars(accent)}>
      <Container className="max-w-4xl">
        <WrappedView wrapped={wrapped} username={owner.username} accent={accent.base} own={own} years={years} />
      </Container>
    </div>
  )
}
