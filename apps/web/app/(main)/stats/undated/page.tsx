import { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Container from '@/app/components/Container'
import getCurrentUser from '@/app/actions/getCurrentUser'
import prisma from '@/lib/db'
import UndatedReads from '@/app/components/stats/UndatedReads'

export const metadata: Metadata = {
  title: 'Add dates to past reads',
  robots: { index: false },
}

// Finished reads with no date, usually from an import whose "Date Read" was empty. They count toward
// books read but no year, so this is where the reader dates them quickly, one row each.
const Page = async () => {
  const user = await getCurrentUser()
  if (!user) redirect('/signin?callbackUrl=/stats/undated')

  const reads = await prisma.bookRead.findMany({
    where: { userId: user.id, status: 'COMPLETED', finishedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, startedAt: true, book: { select: { id: true, title: true, author: true, coverImage: true, cardColour: true, workKey: true } } },
  })

  return (
    <div className="pt-4 pb-24 min-h-[calc(100vh_-_180px)] bg-background">
      <Container>
        <div className="mx-auto max-w-3xl px-4 sm:px-8">
          <Link href="/stats" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} aria-hidden />Reading stats
          </Link>
          <h1 className="mt-4 text-2xl font-semibold">Add dates to past reads</h1>
          <p className="mt-2 text-muted-foreground">
            These finishes have no date, so they count toward your books read but not toward any year, month or goal.
            Add the day you finished (a rough one is fine), or leave any you don&apos;t remember.
          </p>
          <UndatedReads reads={reads.map((r) => ({ id: r.id, startedAt: r.startedAt?.toISOString() ?? null, book: r.book }))} />
        </div>
      </Container>
    </div>
  )
}

export default Page
