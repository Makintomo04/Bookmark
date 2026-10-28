import { Metadata } from 'next'
import Container, { PAGE_TOP } from '@/app/components/Container'
import NewBuddyReadForm from '@/app/components/buddy-reads/NewBuddyReadForm'

export const metadata: Metadata = {
  title: "Start a reading circle",
}

interface PageProps {
  searchParams: { bookId?: string }
}

const Page = ({ searchParams }: PageProps) => {
  return (
    <div className={PAGE_TOP}>
      {/* Wide: the form keeps its fields to the narrow column, and its button row spans the page. */}
      <Container>
        <NewBuddyReadForm initialBookId={typeof searchParams.bookId === "string" ? searchParams.bookId : undefined} />
      </Container>
    </div>
  )
}

export default Page
