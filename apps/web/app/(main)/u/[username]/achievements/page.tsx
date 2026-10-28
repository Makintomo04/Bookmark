import { Metadata } from 'next'
import { handleOf, profileHandle } from '@/lib/handle'
import { readerName } from '@/lib/profile'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { hasRequested } from '@/lib/followRequests'
import { getAchievementsView, getPublicProfile } from '@/lib/publicProfile'
import Container from '@/app/components/Container'
import RestrictedProfile from '@/app/components/profile-head/RestrictedProfile'
import ReaderAchievementsView from './ReaderAchievementsView'

interface PageProps {
  params: { username: string }
}

// Built from the signed-out view, like the profile's: a followers-only or private profile gives away
// nothing but its username, and isn't indexed.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await getPublicProfile(handleOf(params.username))
  if (!data) return { title: "Reader not found", robots: { index: false } }
  const { username } = data.profile
  return {
    title: `${readerName(data.profile)}'s achievements`,
    alternates: { canonical: `/u/${encodeURIComponent(username)}/achievements` },
    ...(data.access === "restricted" && { robots: { index: false } }),
  }
}

// Another reader's tier and medals, read-only. Privacy is the profile's own (getAchievementsView):
// whoever can't see their profile gets the restricted profile here too.
export default async function Page({ params }: PageProps) {
  const viewer = await getCurrentUser()
  const data = await getAchievementsView(profileHandle(params.username, "/achievements"), viewer?.id)
  if (!data) notFound()

  if (data.access === "full" && data.relation.isSelf) redirect('/achievements')

  const profileHref = `/u/${encodeURIComponent(data.profile.username)}`
  let content
  if (data.access === "restricted") {
    // A reader who blocked the viewer looks the same as one that doesn't exist.
    if (data.reason === "unavailable") notFound()
    content = (
      <RestrictedProfile
        profile={data.profile}
        reason={data.reason}
        viewer={viewer ? { isFollowing: data.relation.isFollower, requested: await hasRequested(viewer.id, data.userId) } : null}
      />
    )
  } else {
    content = (
      <>
        <Link href={profileHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          <ChevronLeft size={16} aria-hidden />{readerName(data.profile)}
        </Link>
        <h1 className="page-title mt-2 mb-8 break-words">{readerName(data.profile)}&rsquo;s achievements</h1>
        <ReaderAchievementsView data={data.achievements} />
      </>
    )
  }

  return (
    <div className="mt-8 sm:mt-12 pb-24">
      <Container>{content}</Container>
    </div>
  )
}
