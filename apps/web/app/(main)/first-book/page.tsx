import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import FirstBookPicker from '@/app/components/first-book/FirstBookPicker'
import getCurrentUser from '@/app/actions/getCurrentUser'

export const metadata: Metadata = {
  title: "Help me pick a book",
}

// "Help me pick my first book" (BOO-52): onboarding's option for a reader who doesn't know what to read
// yet, and where an empty shelf, a Library with nothing on the go and Discover point.
const Page = async () => {
  const user = await getCurrentUser()
  if (!user) redirect('/signin?callbackUrl=/first-book')

  return (
    <div className="mt-6 sm:mt-8">
      <Container className="flex flex-col gap-10">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold">Help me pick a book</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            A few places to start, from what you&apos;ve saved, the people you follow, the Bookmark team and the genres you picked. Tap a cover to read what it&apos;s about.
          </p>
        </div>
        <FirstBookPicker profileHref={user.username ? `/u/${encodeURIComponent(user.username)}` : '/'} />
      </Container>
    </div>
  )
}

export default Page
