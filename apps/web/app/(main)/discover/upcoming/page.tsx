import { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import Container from '@/app/components/Container'
import { UpcomingGrid } from '@/app/components/discover/Upcoming'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { zoneOf } from '@/lib/jobs/common'
import { upcomingBooks } from '@/lib/upcoming'
import { localClock } from '@bookmark/shared/reminders'

export const metadata: Metadata = {
  title: "Upcoming",
  description: "Books on the way, with the date each comes out. Authors and series you follow come first.",
}

// "Today" is the reader's own day.
export const dynamic = 'force-dynamic'

const Page = async () => {
  const viewer = await getCurrentUser()
  const today = localClock(new Date(), zoneOf(viewer?.timeZone)).day
  const books = await upcomingBooks(viewer?.id ?? null, { today, limit: 120 })

  return (
    <div className="mt-6 sm:mt-8">
      <Container className="flex flex-col gap-8">
        <div>
          <Link href="/discover" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft size={16} aria-hidden />Discover
          </Link>
          <h1 className="mt-3 text-3xl sm:text-4xl font-bold">Upcoming</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Books on the way, soonest first. {viewer ? "Authors and series you follow come first. " : ""}Put one on Want to read and we&apos;ll tell you the morning it comes out.
          </p>
        </div>
        {books.length > 0 ? <UpcomingGrid books={books} /> : (
          <p className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-sm text-muted-foreground">
            Nothing on the way just yet. Follow an author or a series and their new books will show here as they&apos;re announced.
          </p>
        )}
      </Container>
    </div>
  )
}

export default Page
