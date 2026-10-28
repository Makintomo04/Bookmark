import { Metadata } from 'next'
import { handleOf, profileHandle } from '@/lib/handle'
import { readerName } from '@/lib/profile'
import { notFound } from 'next/navigation'
import Container from '@/app/components/Container'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { getWrapped, getWrappedOwner, getWrappedYears, isWrappedPublic, parseWrappedYear } from '@/lib/stats'
import { canViewUser } from '@/lib/privacy'
import WrappedView from '@/app/components/wrapped/WrappedView'
import { ACCENT_SCOPE, accentVars, readerAccent } from '@/app/components/stats/accent'

interface PageProps {
  params: Promise<{ username: string; year: string }>
}

const plural = (n: number, one: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : `${one}s`}`

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const year = parseWrappedYear(params.year)
  const owner = year ? await getWrappedOwner(handleOf(params.username)) : null
  if (!year || !owner || !(await isWrappedPublic(owner))) return { title: 'Wrapped not found', robots: { index: false } }

  const w = await getWrapped(owner.id, year, null, { sharedOnly: true })
  const name = readerName(owner)
  const title = `${name}'s ${year} in books`
  const description = w.books
    ? `${name} finished ${plural(w.books, 'book')} and ${plural(w.pages, 'page')} in ${year}${w.topGenre ? `, mostly ${w.topGenre.name}` : ''}. See their Bookmark Wrapped.`
    : `${name}'s ${year} on Bookmark.`
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

export default async function Page(props: PageProps) {
  const params = await props.params;
  const year = parseWrappedYear(params.year)
  if (!year) notFound()
  const [owner, viewer] = await Promise.all([getWrappedOwner(profileHandle(params.username, `/wrapped/${params.year}`)), getCurrentUser()])
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
        <WrappedView wrapped={wrapped} username={owner.username} name={readerName(owner)} accent={accent.base} own={own} years={years} />
      </Container>
    </div>
  )
}
