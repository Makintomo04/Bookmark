import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { getReadingStats, isWrappedSeason } from '@/lib/stats'
import StatsView, { StatsEmpty } from '@/app/components/stats/StatsView'
import { ACCENT_SCOPE, accentVars, readerAccent } from '@/app/components/stats/accent'
import MonthlyWrapCards from '@/app/components/wrapped/MonthlyWrapCards'

export const metadata: Metadata = {
  title: 'Reading stats',
  description: 'Every reading stat, free: books and pages by year and month, ratings, genres, authors, re-reads and your streak.',
  robots: { index: false },
}

interface PageProps {
  searchParams: { year?: string }
}

const Page = async ({ searchParams }: PageProps) => {
  const user = await getCurrentUser()
  if (!user) redirect('/signin?callbackUrl=/stats')

  const stats = await getReadingStats(user.id)
  const thisYear = stats.years[stats.years.length - 1]?.year ?? new Date().getFullYear()
  const asked = Number(searchParams.year)
  const year = stats.years.some((y) => y.year === asked) ? asked : thisYear
  const isEmpty = stats.booksRead === 0 && stats.dnf === 0

  // Past years with books always have a Wrapped; this year's opens in December.
  const wrappedYears = stats.years
    .filter((y) => y.books > 0 && (y.year < thisYear || isWrappedSeason()))
    .map((y) => y.year)
    .reverse()
    .slice(0, 4)

  return (
    <div className={`mt-8 sm:mt-12 ${ACCENT_SCOPE}`} style={accentVars(readerAccent(user.favColour))}>
      <Container>
        <h1 className="text-3xl sm:text-4xl font-bold">Your reading stats</h1>
        <p className="mt-2 mb-8 text-muted-foreground">All of it, free. No upgrade, no paywall: it&apos;s your data.</p>
        {isEmpty ? <StatsEmpty /> : <StatsView stats={stats} year={year} yearHref={(y) => `/stats?year=${y}`} wrappedYears={wrappedYears} monthlyCards={<MonthlyWrapCards />} />}
      </Container>
    </div>
  )
}

export default Page
