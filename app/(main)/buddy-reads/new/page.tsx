import { Metadata } from 'next'
import Container from '@/app/components/Container'
import NewBuddyReadForm from '@/app/components/buddy-reads/NewBuddyReadForm'

export const metadata: Metadata = {
  title: "Start a buddy read",
}

interface PageProps {
  searchParams: { bookId?: string }
}

const Page = ({ searchParams }: PageProps) => {
  return (
    <div className="mt-8 sm:mt-12">
      <Container className="max-w-2xl">
        <NewBuddyReadForm initialBookId={typeof searchParams.bookId === "string" ? searchParams.bookId : undefined} />
      </Container>
    </div>
  )
}

export default Page
