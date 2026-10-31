import { Metadata } from 'next'
import Container, { PAGE_TOP } from '@/app/components/Container'
import NewBuddyReadForm from '@/app/components/buddy-reads/NewBuddyReadForm'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { findClubMembership } from '@/lib/clubsServer'

export const metadata: Metadata = {
  title: "Start a reading circle",
}

interface PageProps {
  // ?clubId= starts that club's next book (its host and co-hosts only).
  searchParams: Promise<{ bookId?: string, clubId?: string }>
}

const Page = async (props: PageProps) => {
  const searchParams = await props.searchParams;
  const viewer = typeof searchParams.clubId === "string" ? await getCurrentUser() : null
  const membership = viewer ? await findClubMembership(searchParams.clubId!, viewer.id) : null
  const club = membership?.canManage ? { id: membership.club.id, name: membership.club.name } : undefined
  return (
    <div className={PAGE_TOP}>
      {/* Wide: the form keeps its fields to the narrow column, and its button row spans the page. */}
      <Container>
        <NewBuddyReadForm initialBookId={typeof searchParams.bookId === "string" ? searchParams.bookId : undefined} club={club} />
      </Container>
    </div>
  )
}

export default Page
