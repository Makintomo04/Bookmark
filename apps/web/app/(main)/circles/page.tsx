import { Metadata } from 'next'
import Container from '@/app/components/Container'
import BuddyReadsList from '@/app/components/buddy-reads/BuddyReadsList'

export const metadata: Metadata = {
  title: "Reading circles",
  description: "Read a book together with friends. Everyone's progress in one place, and comments that stay hidden until you reach them.",
}

const Page = () => {
  return (
    <div className="mt-8 sm:mt-12">
      {/* The page's own width, but on the same left edge as the header and every other app page. */}
      <Container>
        <div className="max-w-5xl"><BuddyReadsList /></div>
      </Container>
    </div>
  )
}

export default Page
