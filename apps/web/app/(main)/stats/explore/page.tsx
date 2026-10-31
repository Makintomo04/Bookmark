import { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Container from '@/app/components/Container'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { explorerFinishes } from '@/lib/stats'
import { listStatViews } from '@/lib/statViews'
import { entitlementsOf } from '@/lib/entitlements'
import UpgradePrompt from '@/app/components/plus/UpgradePrompt'
import StatsExplorer from '@/app/components/stats/StatsExplorer'
import { ACCENT_SCOPE, accentVars, readerAccent } from '@/app/components/stats/accent'
import { NO_FILTERS, explore, parseExplorerQuery, presetRange } from '@bookmark/shared/statsExplorer'

export const metadata: Metadata = {
  title: 'Explore your stats',
  description: 'Any dates, two periods side by side, and filters by format, genre, mood, spice, author and re-reads. Bookmark Plus.',
  robots: { index: false },
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// The stats explorer (BOO-82, Plus). A free reader gets the upgrade prompt here and nothing else changes:
// every stat on /stats stays free. The route under it (/api/stats/explore) checks the plan too.
const Page = async (props: PageProps) => {
  const searchParams = await props.searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/signin?callbackUrl=/stats/explore')
  const canExplore = entitlementsOf(user).statsExplorer

  const header = (
    <>
      <Link href="/stats" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} aria-hidden /> Your reading stats
      </Link>
      <h1 className="page-title mt-3">Explore your stats</h1>
      <p className="mt-2 mb-8 text-muted-foreground">Pick any dates, set two periods side by side, and narrow it down by format, genre, mood, spice, author or re-reads.</p>
    </>
  )

  if (!canExplore) {
    return (
      <div className={`mt-8 sm:mt-12 ${ACCENT_SCOPE}`} style={accentVars(readerAccent(user.favColour))}>
        <Container>
          {header}
          <UpgradePrompt feature="statsExplorer" />
          <p className="mt-4 text-sm text-muted-foreground">
            Your <Link href="/stats" className="underline underline-offset-2 hover:text-foreground">stats page</Link>, your Wrapped and every monthly and yearly card stay free.
          </p>
        </Container>
      </div>
    )
  }

  const [{ finishes, today, timeZone }, views] = await Promise.all([explorerFinishes(user.id), listStatViews(user.id)])
  const parsed = parseExplorerQuery(searchParams, today)
  // An address it can't read opens on this year, and says why.
  const query = parsed.ok ? parsed.query : { range: presetRange('thisYear', today), compare: null, filters: NO_FILTERS }

  return (
    <div className={`mt-8 sm:mt-12 ${ACCENT_SCOPE}`} style={accentVars(readerAccent(user.favColour))}>
      <Container>
        {header}
        <StatsExplorer initial={explore(finishes, query)} today={today} timeZone={timeZone} initialViews={views} initialError={parsed.ok ? null : parsed.error} />
      </Container>
    </div>
  )
}

export default Page
