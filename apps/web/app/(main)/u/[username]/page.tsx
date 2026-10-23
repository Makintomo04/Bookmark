import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hasRequested, needsFollowApproval } from '@/lib/followRequests'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { currentBook, getProfileView, getPublicProfile, readingCounts, serializeProfile } from '@/lib/publicProfile'
import Container from '@/app/components/Container'
import PublicProfile from '@/app/components/profile-head/PublicProfile'
import OwnerProfile from '@/app/components/profile-head/OwnerProfile'
import RestrictedProfile from '@/app/components/profile-head/RestrictedProfile'

interface PageProps {
  params: { username: string }
}

// Metadata is what link unfurls and search engines see, so it's built from the signed-out view
// whoever asks: a followers-only or private profile gives away nothing but its username.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await getPublicProfile(params.username)
  // The page itself calls notFound(), which renders ./not-found.tsx; thrown from here it would skip that boundary.
  if (!data) return { title: "Reader not found", robots: { index: false } }

  const url = `/u/${encodeURIComponent(data.profile.username)}`
  if (data.access === "restricted") {
    return {
      title: `${data.profile.username} on Bookmark`,
      description: "This reader's profile isn't public.",
      robots: { index: false },
      alternates: { canonical: url },
    }
  }

  const { profile } = data
  const { booksRead } = readingCounts(profile.books)
  const reading = currentBook(profile.books)
  const title = `${profile.username}'s reading`
  const description = profile.bio?.trim()
    || `${profile.username} has read ${booksRead} ${booksRead === 1 ? "book" : "books"} on Bookmark${reading ? ` and is reading ${reading.title} by ${reading.author}` : ""}.`

  // The share image comes from ./opengraph-image and ./twitter-image.
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "profile", username: profile.username, title, description, url, siteName: "Bookmark" },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default async function Page({ params }: PageProps) {
  const viewer = await getCurrentUser()
  const data = await getProfileView(params.username, viewer?.id)
  if (!data) notFound()

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
  } else if (viewer && data.relation.isSelf) {
    const profile = serializeProfile(data.profile)
    // Credentials and the subscription id stay on the server (as lib/sanitizeUser.ts does for the API).
    const { hashedPassword, password, stripeSubscriptionId, ...self } = viewer
    const profileKey = `/api/users/${encodeURIComponent(profile.username)}`
    content = (
      <OwnerProfile
        username={profile.username}
        fallback={{
          // The same payloads those routes return, so the owner's header paints with the page.
          "/api/user": { ...self, _count: { books: readingCounts(data.profile.books).booksRead } },
          "/api/favourites": self,
          [profileKey]: { ...profile, restricted: null, isFollowing: false, isSelf: true, isBlocked: false },
        }}
      />
    )
  } else {
    content = (
      <PublicProfile
        profile={serializeProfile(data.profile)}
        viewer={viewer ? {
          isFollowing: data.relation.isFollower,
          requested: !data.relation.isFollower && await hasRequested(viewer.id, data.userId),
          needsApproval: needsFollowApproval(data.privacy),
        } : null}
      />
    )
  }

  return (
    <div className="pt-4 pb-24 min-h-[calc(100vh_-_180px)] bg-background">
      <Container>{content}</Container>
    </div>
  )
}
