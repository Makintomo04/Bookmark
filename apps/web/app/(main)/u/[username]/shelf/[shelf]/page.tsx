import { Metadata } from 'next'
import { handleOf, profileHandle } from '@/lib/handle'
import { readerName } from '@/lib/profile'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import type { Book } from '@prisma/client'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { restrictedViewerFlags } from '@/lib/friends'
import { getProfileView, getPublicProfile } from '@/lib/publicProfile'
import { SHELF_SLUG, SHELF_STATUS, SHELF_TITLE, shelfFromSlug, sortBooks, type ShelfKey } from '@/lib/shelfFilter'
import Container from '@/app/components/Container'
import RestrictedProfile from '@/app/components/profile-head/RestrictedProfile'
import OwnerShelf from '@/app/components/books/OwnerShelf'
import PublicShelf from '@/app/components/profile-head/PublicShelf'

interface PageProps {
  params: { username: string; shelf: string }
}

// The shelves a profile shows to others (lib/publicProfile.ts loads only these). The rest are the owner's.
const PUBLIC_SHELVES: ShelfKey[] = ["reading", "finished", "want"]

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const shelf = shelfFromSlug(params.shelf)
  const data = await getPublicProfile(handleOf(params.username))
  if (!data || !shelf) return { title: "Shelf not found", robots: { index: false } }
  const { username } = data.profile
  return {
    title: `${readerName(data.profile)}'s ${SHELF_TITLE[shelf]} shelf`,
    alternates: { canonical: `/u/${encodeURIComponent(username)}/shelf/${SHELF_SLUG[shelf]}` },
    robots: { index: false },
  }
}

// One shelf on its own page, where a profile's "See all" leads. The owner gets the shelf's search, sort,
// filters and select mode; anyone else sees the shelf read-only, behind the profile's own privacy.
export default async function Page({ params }: PageProps) {
  const shelf = shelfFromSlug(params.shelf)
  if (!shelf) notFound()
  const viewer = await getCurrentUser()
  const data = await getProfileView(profileHandle(params.username, `/shelf/${params.shelf}`), viewer?.id)
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
    // Hidden shelves (Want to read, when the reader keeps it to themselves) never arrive in the payload.
    if (!isSelf && !PUBLIC_SHELVES.includes(shelf)) notFound()
    const books = isSelf ? [] : sortBooks(profile.books.filter((b) => b.status === SHELF_STATUS[shelf]), "recent")
    const profileHref = `/u/${encodeURIComponent(profile.username)}`
    content = (
      <>
        <Link href={profileHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          <ChevronLeft size={16} aria-hidden />{isSelf ? "Your profile" : readerName(profile)}
        </Link>
        <h1 className="page-title mt-2 mb-8 break-words">
          {isSelf ? SHELF_TITLE[shelf] : `${readerName(profile)}’s ${SHELF_TITLE[shelf]}`}
          {!isSelf && <span className="ml-3 text-lg font-normal text-muted-foreground tabular-nums">{books.length.toLocaleString('en-GB')}</span>}
        </h1>
        {isSelf
          ? <OwnerShelf shelf={shelf} />
          : books.length > 0
            // The cards take a Book; the public payload is the subset of it they read.
            ? <PublicShelf books={JSON.parse(JSON.stringify(books)) as Book[]} shelf={shelf} accentColour={profile.favColour} />
            : <p className="text-sm text-muted-foreground">Nothing on this shelf yet.</p>}
      </>
    )
  }

  return (
    <div className="mt-8 sm:mt-12 pb-24">
      <Container>{content}</Container>
    </div>
  )
}
