import { Metadata } from 'next'
import { handleOf, profileHandle } from '@/lib/handle'
import { readerName } from '@/lib/profile'
import { notFound, redirect } from 'next/navigation'
import { parseShelfParams, shelfPageHref } from '@/lib/shelfFilter'
import { hasRequested, needsFollowApproval } from '@/lib/followRequests'
import { followsBack, restrictedViewerFlags } from '@/lib/friends'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { currentBook, getProfileView, getPublicProfile, readingCounts, serializeProfile } from '@/lib/publicProfile'
import Container from '@/app/components/Container'
import PublicProfile from '@/app/components/profile-head/PublicProfile'
import OwnerProfile from '@/app/components/profile-head/OwnerProfile'
import RestrictedProfile from '@/app/components/profile-head/RestrictedProfile'
import { profileLayoutOf } from '@/app/components/profile-head/Band'
import { sharedCircles } from '@/lib/sharedCircles'
import { findLists } from '@/lib/lists'
import { publicProfileKey } from '@/lib/profileKey'
import { shelfReviewCount } from '@/lib/reviewedBooks'

interface PageProps {
  params: Promise<{ username: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

// Metadata is what link unfurls and search engines see, so it's built from the signed-out view
// whoever asks: a followers-only or private profile gives away nothing but its username.
export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const data = await getPublicProfile(handleOf(params.username))
  // The page itself calls notFound(), which renders ./not-found.tsx; thrown from here it would skip that boundary.
  if (!data) return { title: "Reader not found", robots: { index: false } }

  const url = `/u/${encodeURIComponent(data.profile.username)}`
  const name = readerName(data.profile)
  if (data.access === "restricted") {
    return {
      title: `${name} on Bookmark`,
      description: "This reader's profile isn't public.",
      robots: { index: false },
      alternates: { canonical: url },
    }
  }

  const { profile } = data
  const { booksRead } = readingCounts(profile.books)
  const reading = currentBook(profile.books)
  const title = `${name}'s reading`
  const description = profile.bio?.trim()
    || `${name} has read ${booksRead} ${booksRead === 1 ? "book" : "books"} on Bookmark${reading ? ` and is reading ${reading.title} by ${reading.author}` : ""}.`

  // The share image comes from ./opengraph-image and ./twitter-image.
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "profile", username: profile.username, title, description, url, siteName: "Bookmark" },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default async function Page(props: PageProps) {
  const searchParams = (await props.searchParams) ?? {};
  const params = await props.params;
  // Links from before shelves had their own pages (?shelf=finished) go to the shelf's page.
  const one = (name: string) => { const v = searchParams[name]; return typeof v === 'string' ? v : null }
  const linked = parseShelfParams({ get: one })
  if (linked.shelf) redirect(shelfPageHref(handleOf(params.username), linked.shelf, linked))
  // The profile in bands; ?layout=classic is the one-column page it replaced (Band.tsx).
  const layout = profileLayoutOf(one('layout'))
  const viewer = await getCurrentUser()
  const data = await getProfileView(profileHandle(params.username), viewer?.id)
  if (!data) notFound()

  let content
  if (data.access === "restricted") {
    // A reader who blocked the viewer looks the same as one that doesn't exist.
    if (data.reason === "unavailable") notFound()
    content = (
      <RestrictedProfile
        profile={data.profile}
        reason={data.reason}
        viewer={viewer ? await restrictedViewerFlags(viewer.id, data.userId, data.relation) : null}
      />
    )
  } else if (viewer && data.relation.isSelf) {
    // Your books reach the page once, as your shelf (/api/books); the header's copy of your profile leaves them out.
    const { books, ...profile } = serializeProfile(data.profile)
    // Credentials and the subscription id stay on the server (as lib/sanitizeUser.ts does for the API).
    const { hashedPassword, password, stripeSubscriptionId, ...self } = viewer
    content = (
      <OwnerProfile
        username={profile.username}
        layout={layout}
        fallback={{
          // The same payloads those routes return, so the owner's header paints with the page.
          "/api/user": { ...self, _count: { books: readingCounts(data.profile.books).booksRead } },
          "/api/favourites": self,
          [publicProfileKey(profile.username, { books: false })]: { ...profile, reviewCount: shelfReviewCount(books), restricted: null, isFollowing: false, isSelf: true, isBlocked: false },
        }}
      />
    )
  } else {
    content = (
      <PublicProfile
        profile={serializeProfile(data.profile)}
        layout={layout}
        // In bands, a circle the viewer shares with them pins its book first on their reading cards.
        sharedCircles={viewer && layout === 'bands' ? await sharedCircles(viewer.id, data.userId) : []}
        hasLists={(await findLists({ owner: data.profile.username, limit: 1 }, viewer)).length > 0}
        viewer={viewer ? {
          isFollowing: data.relation.isFollower,
          requested: !data.relation.isFollower && (await hasRequested(viewer.id, data.userId)),
          needsApproval: needsFollowApproval(data.privacy),
          followsYou: await followsBack(viewer.id, data.userId),
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
