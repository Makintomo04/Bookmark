import { Metadata } from 'next'
import Container, { PAGE_TOP } from '@/app/components/Container'
import NewClubForm from '@/app/components/clubs/NewClubForm'

export const metadata: Metadata = {
  title: "Start a club",
}

const Page = () => {
  return (
    <div className={PAGE_TOP}>
      <Container>
        <NewClubForm />
      </Container>
    </div>
  )
}

export default Page
