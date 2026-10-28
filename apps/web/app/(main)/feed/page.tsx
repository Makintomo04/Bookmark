import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import getCurrentUser from '@/app/actions/getCurrentUser'
import FeedTabs from '@/app/components/feed/FeedTabs'
import { feedTabHref, parseFeedTab } from '@/lib/feedTabs'

export const metadata: Metadata = {
  title: 'Feed',
  robots: { index: false },
}

// What the people you follow are reading, and, on its own tab, every notification (where the bell's menu
// ends with "See all notifications"). /notifications redirects here with ?tab=notifications.
export default async function Page({ searchParams }: { searchParams: { tab?: string } }) {
  const tab = parseFeedTab(searchParams?.tab)
  const user = await getCurrentUser()
  if (!user) redirect(`/signin?callbackUrl=${encodeURIComponent(feedTabHref(tab))}`)

  return (
    <div className="mt-8 sm:mt-12 pb-24">
      <Container>
        <div className="max-w-2xl">
          <h1 className="page-title mb-6">Feed</h1>
          <FeedTabs tab={tab} />
        </div>
      </Container>
    </div>
  )
}
