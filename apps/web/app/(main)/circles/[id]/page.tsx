import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import BuddyReadView from '@/app/components/buddy-reads/BuddyReadView'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { loadBuddyReadView, markCircleSeen } from '@/lib/buddyReadsServer'

interface PageProps {
  params: { id: string }
}

// Private to members, so the title is generic: no book title in a tab or history for a non-member to see.
export const metadata: Metadata = {
  title: "Reading circle",
  robots: { index: false },
}

// Rendered with the first load already spoiler-locked for this reader; the client then polls for updates.
const Page = async ({ params }: PageProps) => {
  const viewer = await getCurrentUser()
  if (!viewer) redirect(`/signin?callbackUrl=${encodeURIComponent(`/circles/${params.id}`)}`)
  const view = await loadBuddyReadView(params.id, viewer.id)
  if (!view) notFound()
  await markCircleSeen(view.buddyRead.id, viewer.id)

  return (
    <div className="mt-8 sm:mt-12">
      {/* The page's own width, but on the same left edge as the header and every other app page. */}
      <Container>
        <div className="max-w-5xl"><BuddyReadView id={params.id} initial={view} /></div>
      </Container>
    </div>
  )
}

export default Page
