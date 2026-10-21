import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { currentBook, getPublicProfile, isFollowing, readingCounts, serializeProfile } from '@/lib/publicProfile'
import Container from '@/app/components/Container'
import PublicProfile from '@/app/components/profile-head/PublicProfile'
import OwnerProfile from '@/app/components/profile-head/OwnerProfile'

interface PageProps {
  params: { username: string }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await getPublicProfile(params.username)
  // The page itself calls notFound(), which renders ./not-found.tsx; thrown from here it would skip that boundary.
  if (!data) return { title: "Reader not found", robots: { index: false } }

  const { profile } = data
  const { booksRead } = readingCounts(profile.books)
  const reading = currentBook(profile.books)
  const title = `${profile.username}'s reading`
  const description = profile.bio?.trim()
    || `${profile.username} has read ${booksRead} ${booksRead === 1 ? "book" : "books"} on Bookmark${reading ? ` and is reading ${reading.title} by ${reading.author}` : ""}.`
  const url = `/u/${encodeURIComponent(profile.username)}`

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
  const [data, viewer] = await Promise.all([getPublicProfile(params.username), getCurrentUser()])
  if (!data) notFound()

  const profile = serializeProfile(data.profile)
  const isSelf = !!viewer && viewer.id === data.userId

  let content
  if (isSelf) {
    const { hashedPassword, password, ...self } = viewer
    const profileKey = `/api/users/${encodeURIComponent(profile.username)}`
    content = (
      <OwnerProfile
        username={profile.username}
        fallback={{
          // The same payloads those routes return, so the owner's header paints with the page.
          "/api/user": { ...self, _count: { books: readingCounts(data.profile.books).booksRead } },
          "/api/favourites": self,
          [profileKey]: { ...profile, isFollowing: false, isSelf: true },
        }}
      />
    )
  } else {
    content = (
      <PublicProfile
        profile={profile}
        viewer={viewer ? { isFollowing: await isFollowing(viewer.id, data.userId) } : null}
      />
    )
  }

  return (
    <div className="pt-4 pb-24 min-h-[calc(100vh_-_180px)] bg-background">
      <Container>{content}</Container>
    </div>
  )
}
