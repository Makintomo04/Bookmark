import { Metadata } from 'next'
import { handleOf, profileHandle } from '@/lib/handle'
import { readerName } from '@/lib/profile'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { hasRequested } from '@/lib/followRequests'
import { getProfileView, getPublicProfile, serializeProfile } from '@/lib/publicProfile'
import Container from '@/app/components/Container'
import RestrictedProfile from '@/app/components/profile-head/RestrictedProfile'
import ProfileReviews from '@/app/components/profile-head/ProfileReviews'
import { reviewedBooks } from '@/lib/reviewedBooks'

interface PageProps {
  params: { username: string }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await getPublicProfile(handleOf(params.username))
  if (!data) return { title: "Reader not found", robots: { index: false } }
  return { title: `${readerName(data.profile)}'s reviews`, robots: { index: false } }
}

// Every review a reader has written that the viewer may read, where the reviews stat under their name
// leads. The profile payload has already applied their review privacy (lib/publicProfile.ts visibleReview);
// a reader sees their own private reviews here, labelled as hidden from everyone else.
export default async function Page({ params }: PageProps) {
  const viewer = await getCurrentUser()
  const data = await getProfileView(profileHandle(params.username, "/reviews"), viewer?.id)
  if (!data) notFound()

  let content
  if (data.access === "restricted") {
    if (data.reason === "unavailable") notFound()
    content = (
      <RestrictedProfile
        profile={data.profile}
        reason={data.reason}
        viewer={viewer ? { isFollowing: data.relation.isFollower, requested: await hasRequested(viewer.id, data.userId) } : null}
      />
    )
  } else {
    const isSelf = data.relation.isSelf
    const profile = serializeProfile(data.profile)
    // Your own count matches your profile's reviews section, which lists finished books.
    const books = isSelf ? profile.books.filter((b) => b.status === "COMPLETED") : profile.books
    const count = reviewedBooks(books).length
    content = (
      <>
        <Link href={`/u/${encodeURIComponent(profile.username)}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          <ChevronLeft size={16} aria-hidden />{isSelf ? "Your profile" : readerName(profile)}
        </Link>
        <h1 className="page-title mt-2 mb-8 break-words">
          {isSelf ? "Your reviews" : `${readerName(profile)}’s reviews`}
          <span className="ml-3 text-lg font-normal text-muted-foreground tabular-nums">{count.toLocaleString('en-GB')}</span>
        </h1>
        {count > 0
          ? <div className="max-w-3xl"><ProfileReviews books={books} accentColour={profile.favColour} canReport={!isSelf} bare /></div>
          : <p className="text-sm text-muted-foreground">{isSelf ? "Reviews you write when you finish a book show up here." : "No reviews to show."}</p>}
      </>
    )
  }

  return (
    <div className="mt-8 sm:mt-12 pb-24">
      <Container>{content}</Container>
    </div>
  )
}
