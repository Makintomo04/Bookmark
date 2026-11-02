import { FC, ReactNode } from 'react'
import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import type { ReadingStats } from '@/lib/stats'
import { cn } from '@/lib/utils'
import { formatPace } from '@/lib/goals'
import { ratingGlyphs } from '@bookmark/shared/rating'
import { ColumnChart, Datum, RankedBars } from './Charts'
import { shelfParams, type ShelfFilter } from '@/lib/shelfFilter'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmt = (n: number) => n.toLocaleString('en-GB')
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`
// The reader's shelf filtered to the books behind a bar (app/(main)/shelf redirects to their profile).
const shelfHref = (filter: Partial<ShelfFilter>) => `/shelf?${shelfParams(filter)}`

interface StatsViewProps {
  stats: ReadingStats
  // The year the month charts show.
  year: number
  // Builds the link for another year's month charts (keeps the page path).
  yearHref: (year: number) => string
  // Wrapped years that can be linked from here.
  wrappedYears: number[]
  // Under the Wrapped links: the Wrap cards (cover grid and stats) and the monthly summary card.
  monthlyCards?: ReactNode
}

const Section: FC<{ title: string; children: ReactNode; className?: string; action?: ReactNode }> = ({ title, children, className, action }) => (
  <section className={cn('rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6', className)}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {action}
    </div>
    {children}
  </section>
)

const Tile: FC<{ label: string; value: string; note?: string; noteHref?: string }> = ({ label, value, note, noteHref }) => (
  <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    {note && (noteHref
      ? <Link href={noteHref} className="mt-1 block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">{note}</Link>
      : <p className="mt-1 text-xs text-muted-foreground">{note}</p>)}
  </div>
)

const Quiet: FC<{ children: ReactNode }> = ({ children }) => <p className="text-sm text-muted-foreground">{children}</p>

export const StatsEmpty: FC = () => (
  <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 px-6 py-14 text-center">
    <BookOpen aria-hidden className="mx-auto h-10 w-10 text-[color:var(--accent-text)]" />
    <h2 className="mt-4 text-xl font-semibold">Nothing to count yet</h2>
    <p className="mx-auto mt-2 max-w-md text-muted-foreground">
      Finish a book and this page fills in: books and pages by year, your ratings, favourite genres and authors, and your streak.
      Already keep track somewhere else? Bring your history with you.
    </p>
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      <Link href="/import" className="rounded-md bg-brand-fill px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-fill-hover">
        Import from Goodreads or StoryGraph
      </Link>
      <Link href="/" className="rounded-md border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-semibold transition hover:bg-neutral-100 dark:hover:bg-neutral-900">
        Add a book
      </Link>
    </div>
  </div>
)

// A Plus goal's line under the yearly bar. Shown whenever one is set: stats are never gated.
const GoalLine: FC<{ label: string; value: string; met: boolean }> = ({ label, value, met }) => (
  <p className="mt-1.5 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
    <span>{label}</span>
    <span className="tabular-nums">
      {value}
      {met ? <span className="ml-2 font-semibold text-[color:var(--accent-text)]">Met</span> : null}
    </span>
  </p>
)

const StatsView: FC<StatsViewProps> = ({ stats, year, yearHref, wrappedYears, monthlyCards }) => {
  const months = stats.months[year] ?? []
  const monthBooks: Datum[] = months.map((m, i) => ({ label: MONTHS[i].slice(0, 3), short: MONTHS[i][0], value: m.books, detail: `${plural(m.books, 'book')} · ${plural(m.pages, 'page')}`, href: shelfHref({ year, month: i + 1, sort: 'finished' }) }))
  const monthPages: Datum[] = months.map((m, i) => ({ label: MONTHS[i].slice(0, 3), short: MONTHS[i][0], value: m.pages, detail: plural(m.pages, 'page') }))
  // The last ten years keep the year charts readable; older years are still in the year picker.
  const recentYears = stats.years.slice(-10)
  const yearBooks: Datum[] = recentYears.map((y) => ({ label: String(y.year), short: `’${String(y.year).slice(2)}`, value: y.books, detail: `${plural(y.books, 'book')} · ${plural(y.pages, 'page')}`, href: shelfHref({ year: y.year, sort: 'finished' }) }))
  const yearPages: Datum[] = recentYears.map((y) => ({ label: String(y.year), short: `’${String(y.year).slice(2)}`, value: y.pages, detail: plural(y.pages, 'page') }))
  const ratingData: Datum[] = stats.ratings.map((r) => ({ label: ratingGlyphs(r.rating), name: `${ratingGlyphs(r.rating)} ${r.rating === 1 ? 'star' : 'stars'}`, value: r.count, detail: plural(r.count, 'book'), href: shelfHref({ rating: r.rating }) }))
  const decadeData: Datum[] = stats.decades.map((d) => ({ label: `${d.decade}s`, short: `’${String(d.decade).slice(2)}`, value: d.count, detail: plural(d.count, 'book') }))
  const lengthData: Datum[] = stats.lengths.map((l) => ({ label: l.label, value: l.count, detail: plural(l.count, 'book') }))
  const listenData: Datum[] = stats.listenLengths.map((l) => ({ label: l.label, value: l.count, detail: plural(l.count, 'audiobook') }))
  const days = stats.daysToFinish

  const yearPicker = stats.years.length > 1 && (
    <nav aria-label="Year" className="flex flex-wrap gap-1">
      {[...stats.years].reverse().map((y) => (
        <Link
          key={y.year}
          href={yearHref(y.year)}
          scroll={false}
          aria-current={y.year === year ? 'page' : undefined}
          className={cn(
            'rounded-full px-3 py-1 text-sm tabular-nums transition',
            y.year === year ? 'bg-foreground text-background font-semibold' : 'text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900'
          )}
        >
          {y.year}
        </Link>
      ))}
    </nav>
  )
  const yearTotal = stats.years.find((y) => y.year === year)

  return (
    <div className="space-y-6">
      {/* Books read leads; pages and hours are the same reading counted another way, so they sit beside it. */}
      <section aria-label="Totals" className="grid gap-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className="text-sm text-muted-foreground">Books read</p>
          <p className="mt-1 font-display text-6xl font-semibold tabular-nums leading-none">{fmt(stats.booksRead)}</p>
          {stats.undatedFinishes > 0 && (
            <Link href="/stats/undated" className="mt-3 inline-block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
              {plural(stats.undatedFinishes, 'finish', 'finishes')} without a date
            </Link>
          )}
        </div>
        <dl className="flex gap-8">
          <div>
            <dt className="text-sm text-muted-foreground">Pages read</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{fmt(stats.pagesRead)}</dd>
          </div>
          {stats.minutesListened > 0 && (
            <div>
              <dt className="text-sm text-muted-foreground">Hours listened</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{fmt(Math.round(stats.minutesListened / 60))}</dd>
            </div>
          )}
        </dl>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <Tile label="Average length" value={stats.averagePages ? `${fmt(stats.averagePages)}` : '–'} note="pages per book" />
        <Tile label="Current streak" value={plural(stats.streak, 'day')} note={stats.streak ? 'in a row' : 'read a page to start one'} />
        <Tile label="Re-reads" value={fmt(stats.rereads)} note={stats.rereadBooks ? `across ${plural(stats.rereadBooks, 'book')}` : 'none yet'} />
        <Tile
          label="Did not finish"
          value={stats.dnfRate === null ? '–' : `${Math.round(stats.dnfRate * 100)}%`}
          note={stats.dnf ? `${plural(stats.dnf, 'book')} put down` : 'of the books you started'}
        />
        <Tile label="Average rating" value={stats.averageRating ? `${stats.averageRating} ★` : '–'} note={stats.ratedBooks ? `from ${plural(stats.ratedBooks, 'rating')}` : 'no ratings yet'} />
        <Tile
          label="Longest book"
          value={stats.longestBook ? fmt(stats.longestBook.pages) : '–'}
          note={stats.longestBook ? stats.longestBook.title : undefined}
        />
      </div>

      {wrappedYears.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-l-4 border-[var(--accent)] bg-neutral-50 dark:bg-neutral-900 p-4 sm:px-6">
          <p className="font-semibold">Your year in books, wrapped up</p>
          <div className="flex flex-wrap gap-2">
            {wrappedYears.map((y) => (
              <Link key={y} href={`/wrapped/${y}`} className="rounded-full bg-foreground px-3 py-1 text-sm font-semibold tabular-nums text-background transition hover:opacity-90">
                {y} Wrapped
              </Link>
            ))}
          </div>
        </div>
      )}

      {monthlyCards}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Books per year">
          <ColumnChart data={yearBooks} label="Books finished per year" unit="books" />
        </Section>
        <Section title="Pages per year">
          <ColumnChart data={yearPages} label="Pages read per year" unit="pages" />
        </Section>
      </div>

      <Section
        title={`${year}, month by month`}
        action={yearPicker}
      >
        {yearTotal && yearTotal.books > 0 ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">Books · {fmt(yearTotal.books)}</h3>
              <ColumnChart data={monthBooks} label={`Books finished each month of ${year}`} unit="books" />
            </div>
            <div>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">Pages · {fmt(yearTotal.pages)}</h3>
              <ColumnChart data={monthPages} label={`Pages read each month of ${year}`} unit="pages" />
            </div>
          </div>
        ) : (
          <Quiet>No finished books dated {year} yet.</Quiet>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="How you rate" className="lg:col-span-1">
          {stats.ratedBooks ? <ColumnChart data={ratingData} label="Books per star rating" unit="books" /> : <Quiet>Rate a book (quarter stars welcome) and your spread shows up here.</Quiet>}
        </Section>
        <Section title="Top genres">
          {stats.genres.length ? <RankedBars data={stats.genres.map((g) => ({ label: g.name, value: g.count, detail: plural(g.count, 'book'), href: shelfHref({ shelf: 'finished', genre: g.name }) }))} label="Genres you read most" unit="books" /> : <Quiet>Books you finish with a genre will be counted here.</Quiet>}
        </Section>
        <Section title="Top authors">
          {stats.authors.length ? <RankedBars data={stats.authors.map((a) => ({ label: a.name, value: a.count, detail: plural(a.count, 'book'), href: shelfHref({ shelf: 'finished', author: a.name }) }))} label="Authors you read most" unit="books" /> : <Quiet>Your most-read authors will show up here.</Quiet>}
        </Section>
      </div>

      {(decadeData.length > 0 || stats.lengths.some((l) => l.count > 0) || days || stats.mostReread) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="How long">
            {stats.lengths.some((l) => l.count > 0) ? <ColumnChart data={lengthData} label="Books finished by page count" unit="books" /> : <Quiet>Books with a page count will be sorted by length here.</Quiet>}
            {stats.listenLengths.some((l) => l.count > 0) && (
              <div className="mt-8">
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">Audiobooks</h3>
                <ColumnChart data={listenData} label="Audiobooks finished by running time" unit="audiobooks" />
              </div>
            )}
          </Section>
          <Section title="When they were written">
            {decadeData.length ? <ColumnChart data={decadeData} label="Books finished by decade first published" unit="books" /> : <Quiet>Books we know the publication year of will be counted by decade here.</Quiet>}
          </Section>
          {(days || stats.mostReread) && (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-2 lg:grid-cols-4">
              {days && <Tile label="Days to finish" value={fmt(days.average)} note={`on average, across ${plural(days.reads, 'dated read')}`} />}
              {days && <Tile label="Quickest read" value={plural(days.fastest.days, 'day')} note={days.fastest.book.title} />}
              {days && <Tile label="Slowest read" value={plural(days.slowest.days, 'day')} note={days.slowest.book.title} />}
              {stats.mostReread && <Tile label="Most re-read" value={`${fmt(stats.mostReread.times)}×`} note={stats.mostReread.book.title} />}
            </div>
          )}
        </div>
      )}

      <Section title="Reading goals">
        {stats.goals.length ? (
          <ul className="space-y-4">
            {stats.goals.map((g) => {
              const percent = Math.min(100, Math.round((g.completed / g.target) * 100))
              return (
                <li key={g.year}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold tabular-nums">{g.year}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmt(g.completed)} of {plural(g.target, 'book')}
                      {g.met ? <span className="ml-2 font-semibold text-[color:var(--accent-text)]">Goal met</span> : null}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${g.year} goal`}
                    aria-valuemin={0}
                    aria-valuemax={g.target}
                    aria-valuenow={Math.min(g.completed, g.target)}
                    className="mt-1 h-2 rounded-full bg-neutral-100 dark:bg-neutral-900"
                  >
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${percent}%` }} />
                  </div>
                  {g.targetPages ? (
                    <GoalLine label="Page goal" value={`${fmt(g.pages)} of ${plural(g.targetPages, 'page')}`} met={g.pages >= g.targetPages} />
                  ) : null}
                  {g.monthsCounted > 0 ? (
                    <GoalLine
                      label={g.paceIsCustom ? `${plural(g.pacePerMonth, 'book')} a month` : `Pace: ${formatPace(g.pacePerMonth)} a month`}
                      value={`${g.monthsMet} of ${plural(g.monthsCounted, 'month')} on pace`}
                      met={g.monthsMet === g.monthsCounted}
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <Quiet>Set a yearly goal from your profile and each year&apos;s result is kept here.</Quiet>
        )}
      </Section>

      <p className="text-center text-xs text-muted-foreground">
        Every stat on this page is free, and always will be. It&apos;s your reading.
        {stats.timeZone !== 'UTC' ? ` Days and months follow ${stats.timeZone} time.` : ''}
      </p>
    </div>
  )
}

export default StatsView
