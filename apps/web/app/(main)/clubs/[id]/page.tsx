import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import ClubView from '@/app/components/clubs/ClubView'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { loadClubView } from '@/lib/clubsServer'

interface PageProps {
  params: Promise<{ id: string }>
}

// Private to members, so the title is generic, as on a reading circle's page.
export const metadata: Metadata = {
  title: "Club",
  robots: { index: false },
}

const Page = async (props: PageProps) => {
  const params = await props.params;
  const viewer = await getCurrentUser()
  if (!viewer) redirect(`/signin?callbackUrl=${encodeURIComponent(`/clubs/${params.id}`)}`)
  const view = await loadClubView(params.id, viewer.id)
  if (!view) notFound()

  return (
    <div className="mt-8 sm:mt-12">
      {/* The page's own width, but on the same left edge as the header and every other app page. */}
      <Container>
        <div className="max-w-5xl"><ClubView id={params.id} initial={view} /></div>
      </Container>
    </div>
  )
}

export default Page
