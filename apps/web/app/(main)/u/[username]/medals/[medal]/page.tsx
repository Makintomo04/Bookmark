import { Metadata } from 'next'
import { handleOf, profileHandle } from '@/lib/handle'
import { readerName } from '@/lib/profile'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { findEarnedMedal } from '@bookmark/shared/medalShare'
import Container from '@/app/components/Container'
import MedalBand from '@/app/components/achievements/MedalBand'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { getProfileView } from '@/lib/publicProfile'
import { primaryButtonClass, secondaryButtonClass } from '@/app/components/profile-head/ProfileHeader'

interface PageProps {
  params: Promise<{ username: string; medal: string }>
}

// One medal a reader has earned, as a link unfurls to: the celebration's Share button points here.
// Only a rung they actually hold, on a profile this viewer may see; anything else is not found.
async function loadMedal(username: string, slug: string, viewerId: string | null) {
  const view = await getProfileView(username, viewerId)
  if (!view || view.access !== 'full') return null
  const medal = findEarnedMedal(view.profile.achievements, slug)
  return medal ? { username: view.profile.username, name: readerName(view.profile), own: view.relation.isSelf, ...medal } : null
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  // Metadata is what crawlers read, so it answers as a signed-out visitor would.
  const data = await loadMedal(handleOf(params.username), params.medal, null)
  if (!data) return { title: 'Medal not found', robots: { index: false } }

  const { username, name, achievement, milestone } = data
  const title = `${name} earned ${milestone.title}`
  const rung = achievement.describe(milestone.value)
  const description = `${achievement.title}: ${rung.charAt(0).toLowerCase()}${rung.slice(1)}. See ${name}'s reading on Bookmark.`
  const url = `/u/${encodeURIComponent(username)}/medals/${params.medal}`

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
  const viewer = await getCurrentUser()
  const data = await loadMedal(profileHandle(params.username, `/medals/${params.medal}`), params.medal, viewer?.id ?? null)
  if (!data) notFound()

  const { username, name, own, achievement, milestone, record } = data
  const description = achievement.describe(milestone.value)
  const earnedOn = new Date(record.earnedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const profileHref = `/u/${encodeURIComponent(username)}`

  return (
    <div className="mt-8 sm:mt-12">
      <Container className="max-w-md">
        <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-background text-center dark:border-neutral-800">
          <MedalBand achievementKey={achievement.key} value={milestone.value} eyebrow={own ? 'Your medal' : `${name}'s medal`} className="mb-5" />
          <div className="px-6 pb-6">
            <h1 className="page-title">{milestone.title}</h1>
            <p className="mt-2 text-muted-foreground">{achievement.title}: {description.charAt(0).toLowerCase()}{description.slice(1)}.</p>
            <p className="mt-4 text-sm text-muted-foreground">Earned on {earnedOn}</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link href={profileHref} className={primaryButtonClass}>{own ? 'Your profile' : `See ${name}'s reading`}</Link>
              {own && <Link href="/achievements" className={secondaryButtonClass}>See all medals</Link>}
            </div>
          </div>
        </article>
      </Container>
    </div>
  )
}
