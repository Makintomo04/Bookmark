import { Metadata } from 'next'
import { handleOf, profileHandle } from '@/lib/handle'
import { readerName } from '@/lib/profile'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import type { Book } from '@prisma/client'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { restrictedViewerFlags } from '@/lib/friends'
import { getProfileView, getPublicProfile } from '@/lib/publicProfile'
import Container from '@/app/components/Container'
import RestrictedProfile from '@/app/components/profile-head/RestrictedProfile'
import FavouritesGrid from '@/app/components/profile-head/FavouritesGrid'
import StaffSeal from '@/app/components/profile-head/StaffSeal'

interface PageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const data = await getPublicProfile(handleOf(params.username))
  if (!data) return { title: "Reader not found", robots: { index: false } }
  return { title: `${readerName(data.profile)}'s favourites`, robots: { index: false } }
}

// Every favourite of another reader, where their profile's favourites row says "See all". Same privacy as
// the row (lib/publicProfile.ts): hidden favourites and private books never arrive. Your own are at /favourites.
export default async function Page(props: PageProps) {
  const params = await props.params;
  const viewer = await getCurrentUser()
  const data = await getProfileView(profileHandle(params.username, "/favourites"), viewer?.id)
  if (!data) notFound()
  if (data.access === "full" && data.relation.isSelf) redirect('/favourites')

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
    content = (
      <>
        <Link href={`/u/${encodeURIComponent(profile.username)}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          <ChevronLeft size={16} aria-hidden />{readerName(profile)}
        </Link>
        <h1 className="page-title mt-2 mb-8 break-words">
          {readerName(profile)}&rsquo;s favourites
          {profile.staffBadge && <StaffSeal kind={profile.staffBadge} name={readerName(profile)} size={26} className="ml-2 align-[-2px]" />}
          <span className="ml-3 text-lg font-normal text-muted-foreground tabular-nums">{profile.favourites.length.toLocaleString('en-GB')}</span>
        </h1>
        {profile.favourites.length > 0
          // The cards take a Book; the public payload is the subset of it they read.
          ? <FavouritesGrid books={JSON.parse(JSON.stringify(profile.favourites)) as Book[]} accentColour={profile.favColour} />
          : <p className="text-sm text-muted-foreground">No favourites to show.</p>}
      </>
    )
  }

  return (
    <div className="mt-8 sm:mt-12 pb-24">
      <Container>{content}</Container>
    </div>
  )
}
