import { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import Container from '@/app/components/Container'
import AskShelf, { AiLabel } from '@/app/components/discover/AskShelf'
import { primaryButtonClass } from '@/app/components/profile-head/ProfileHeader'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { aiAvailable } from '@/lib/ai/client'
import { allowanceStatus, usageAccountOf } from '@/lib/ai/usage'
import { preferencesOf } from '@/lib/preferences'

export const metadata: Metadata = {
  title: "Ask the shelf",
  description: "Describe the book you're in the mood for and find it in Bookmark's catalog, with what your friends loved first.",
}

// Reads the reader's allowance on every visit.
export const dynamic = 'force-dynamic'

const Page = async () => {
  const viewer = await getCurrentUser()

  return (
    <div className="mt-6 sm:mt-8">
      <Container className="flex flex-col gap-8">
        <div>
          <Link href="/discover" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft size={16} aria-hidden />Discover
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="page-title">Ask the shelf</h1>
            <AiLabel />
          </div>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Describe the read you&apos;re after in your own words. AI turns it into a search of Bookmark&apos;s catalog; books loved by people you follow come first.
          </p>
        </div>

        {viewer ? (
          <AskShelf
            available={aiAvailable()}
            enabled={preferencesOf(viewer).aiFeatures}
            initialStatus={await allowanceStatus(viewer.id, "askShelfSearches", { account: usageAccountOf(viewer) })}
          />
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 max-w-2xl">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">Sign in to ask the shelf. Searches leave out the books you already have and put your friends&apos; favourites first.</p>
            <Link href="/signin?callbackUrl=/discover/ask" className={primaryButtonClass}>Sign in</Link>
          </div>
        )}
      </Container>
    </div>
  )
}

export default Page
