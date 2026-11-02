import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import NoteSearch from '@/app/components/notes/NoteSearch'
import getCurrentUser from '@/app/actions/getCurrentUser'

export const metadata: Metadata = {
  title: "Your notes",
  description: "Every note you've written, in one place.",
}

// Every note the reader has written, on every plan (app/api/notes/route.ts).
const Page = async () => {
  const viewer = await getCurrentUser()
  if (!viewer) redirect('/signin?callbackUrl=/notes')

  return (
    <div className="mt-6 sm:mt-8">
      <Container className="flex flex-col gap-8">
        <div>
          <h1 className="page-title">Your notes</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Every note you&apos;ve written, in one place.
          </p>
        </div>
        <NoteSearch />
      </Container>
    </div>
  )
}

export default Page
