import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import getCurrentUser from '@/app/actions/getCurrentUser'
import ImportFlow from './ImportFlow'

export const metadata: Metadata = {
  title: "Import your library",
  description: "Bring your shelves, ratings, reviews and reading dates from Goodreads or StoryGraph in about a minute.",
}

const Page = async () => {
  const user = await getCurrentUser()
  if (!user) redirect('/signin?callbackUrl=/import')

  return (
    <div className="mt-8 sm:mt-12">
      <Container className="max-w-3xl">
        <ImportFlow />
      </Container>
    </div>
  )
}

export default Page
