import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { preferencesOf } from '@/lib/preferences'
import { aiAvailable } from '@/lib/ai/client'
import ImportFlow from './ImportFlow'

export const metadata: Metadata = {
  title: "Import your library",
  description: "Bring your shelves, ratings, reviews and reading dates from Goodreads or StoryGraph in about a minute, or paste a list from your notes.",
}

const Page = async () => {
  const user = await getCurrentUser()
  if (!user) redirect('/signin?callbackUrl=/import')

  return (
    <div className="mt-8 sm:mt-12">
      <Container className="max-w-3xl">
        {/* Reading a pasted list with AI is the reader's choice each time; it starts as their AI setting. */}
        <ImportFlow aiAvailable={aiAvailable()} aiDefault={preferencesOf(user).aiFeatures} />
      </Container>
    </div>
  )
}

export default Page
