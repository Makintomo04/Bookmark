import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import FirstBookPicker from '@/app/components/first-book/FirstBookPicker'
import getCurrentUser from '@/app/actions/getCurrentUser'

export const metadata: Metadata = {
  title: "Help me pick a book",
}

// The book picker (BOO-52): "Help me pick my first book" in onboarding, and "Can't decide? Help me pick a book"
// from an empty shelf, a Library with nothing on the go and Discover, for any reader who doesn't know what to
// read next.
const Page = async () => {
  const user = await getCurrentUser()
  if (!user) redirect('/signin?callbackUrl=/first-book')

  return (
    <div className="mt-6 sm:mt-8">
      <Container className="flex flex-col gap-10">
        <div>
          <h1 className="page-title">Help me pick a book</h1>
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
