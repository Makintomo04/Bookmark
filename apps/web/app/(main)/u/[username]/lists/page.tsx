import { Metadata } from 'next'
import { handleOf, profileHandle } from '@/lib/handle'
import { readerName } from '@/lib/profile'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { restrictedViewerFlags } from '@/lib/friends'
import { getProfileView, getPublicProfile } from '@/lib/publicProfile'
import Container from '@/app/components/Container'
import RestrictedProfile from '@/app/components/profile-head/RestrictedProfile'
import AllLists from '@/app/components/discover/AllLists'

interface PageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const data = await getPublicProfile(handleOf(params.username))
  if (!data) return { title: "Reader not found", robots: { index: false } }
  return { title: `${readerName(data.profile)}'s lists`, robots: { index: false } }
}

// Every list a reader has that the viewer may see, where "See all" on the Lists section of their profile goes.
// The lists come from the same request the section makes (/api/lists), so private lists reach only their owner.
export default async function Page(props: PageProps) {
  const params = await props.params;
  const viewer = await getCurrentUser()
  const data = await getProfileView(profileHandle(params.username, "/lists"), viewer?.id)
  if (!data) notFound()

  let content
  if (data.access === "restricted") {
    if (data.reason === "unavailable") notFound()
    content = (
      <RestrictedProfile
        profile={data.profile}
        reason={data.reason}
        viewer={viewer ? await restrictedViewerFlags(viewer.id, data.userId, data.relation) : null}
      />
    )
  } else {
    const { profile } = data
    const isSelf = data.relation.isSelf
    content = (
      <>
        <Link href={`/u/${encodeURIComponent(profile.username)}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          <ChevronLeft size={16} aria-hidden />{isSelf ? "Your profile" : readerName(profile)}
        </Link>
        <AllLists username={profile.username} isSelf={isSelf} name={readerName(profile)} />
      </>
    )
  }

  return (
    <div className="mt-8 sm:mt-12 pb-24">
      <Container>{content}</Container>
    </div>
  )
}
