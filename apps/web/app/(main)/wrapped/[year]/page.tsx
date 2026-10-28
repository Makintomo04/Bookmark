import { Metadata } from 'next'
import { readerName } from '@/lib/profile'
import { notFound, redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { getWrapped, getWrappedYears, parseWrappedYear } from '@/lib/stats'
import WrappedView from '@/app/components/wrapped/WrappedView'
import { ACCENT_SCOPE, accentVars, readerAccent } from '@/app/components/stats/accent'

interface PageProps {
  params: { year: string }
}

export function generateMetadata({ params }: PageProps): Metadata {
  return { title: `Your ${params.year} Wrapped`, robots: { index: false } }
}

// The signed-in reader's own Wrapped. The shareable copy lives at /u/<username>/wrapped/<year>.
export default async function Page({ params }: PageProps) {
  const year = parseWrappedYear(params.year)
  if (!year) notFound()
  const user = await getCurrentUser()
  if (!user) redirect(`/signin?callbackUrl=/wrapped/${year}`)
  if (!user.username) redirect('/new-user')

  const [wrapped, years] = await Promise.all([getWrapped(user.id, year), getWrappedYears(user.id)])
  const accent = readerAccent(user.favColour)

  return (
    <div className={`mt-6 sm:mt-10 ${ACCENT_SCOPE}`} style={accentVars(accent)}>
      <Container className="max-w-4xl">
        <WrappedView wrapped={wrapped} username={user.username} name={readerName(user)} accent={accent.base} own years={years} />
      </Container>
    </div>
  )
}
