import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { getReadingStats, wrappedYearsFor } from '@/lib/stats'
import StatsView, { StatsEmpty } from '@/app/components/stats/StatsView'
import { ACCENT_SCOPE, accentVars, readerAccent } from '@/app/components/stats/accent'
import MonthlyWrapCards from '@/app/components/wrapped/MonthlyWrapCards'
import WrapCardMaker from '@/app/components/wrapped/WrapCardMaker'
import { entitlementsOf } from '@/lib/entitlements'
import { cardToday } from '@bookmark/shared/wrapCards'

export const metadata: Metadata = {
  title: 'Reading stats',
  description: 'Every reading stat, free: books and pages by year and month, ratings, genres, authors, re-reads and your streak.',
  robots: { index: false },
}

interface PageProps {
  searchParams: Promise<{ year?: string }>
}

const Page = async (props: PageProps) => {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser()
  if (!user) redirect('/signin?callbackUrl=/stats')

  const stats = await getReadingStats(user.id)
  const thisYear = stats.years[stats.years.length - 1]?.year ?? new Date().getFullYear()
  const asked = Number(searchParams.year)
  const year = stats.years.some((y) => y.year === asked) ? asked : thisYear
  const isEmpty = stats.booksRead === 0 && stats.dnf === 0

  const wrappedYears = wrappedYearsFor(stats)

  return (
    <div className={`mt-8 sm:mt-12 ${ACCENT_SCOPE}`} style={accentVars(readerAccent(user.favColour))}>
      <Container>
        <h1 className="page-title">Your reading stats</h1>
        <p className="mt-2 mb-8 text-muted-foreground">All of it, free. No upgrade, no paywall: it&apos;s your data.</p>
        {isEmpty ? <StatsEmpty /> : <StatsView stats={stats} year={year} yearHref={(y) => `/stats?year=${y}`} wrappedYears={wrappedYears} monthlyCards={<><WrapCardMaker canPickDesigns={entitlementsOf(user).customWrapDesigns} today={cardToday(user.timeZone)} years={stats.years.map((y) => y.year)} /><MonthlyWrapCards /></>} />}
      </Container>
    </div>
  )
}

export default Page
