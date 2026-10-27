import { FC, ReactNode } from 'react'
import Link from 'next/link'
import type { WrappedData } from '@/lib/stats'
import { readableInk, shade } from '@/lib/colour'
import { ratingGlyphs } from '@bookmark/shared/rating'
import { cn } from '@/lib/utils'
import BookCover from '@/app/components/cards/BookCover'
import Medal from '@/app/components/achievements/Medal'
import * as copy from './copy'
import WrappedShare from './WrappedShare'
import AuthorLink from '@/app/components/AuthorLink'

const fmt = (n: number) => n.toLocaleString('en-GB')

interface WrappedViewProps {
  wrapped: WrappedData
  username: string
  // The reader's favourite colour as #rrggbb.
  accent: string
  own: boolean
  // Other years with a Wrapped, newest first.
  years: number[]
}

type Tone = 'accent' | 'ink' | 'paper'

// One card in the stack. Accent cards sit on the reader's colour with whichever ink reads on it;
// ink cards are near-black like the reader card; paper cards follow the page theme.
const Card: FC<{ tone: Tone; accent: string; label: string; children: ReactNode; className?: string }> = ({ tone, accent, label, children, className }) => {
  // The gradient runs away from the ink (darker under white text, lighter under dark text), so the
  // text keeps its contrast across the whole card.
  const ink = readableInk(accent)
  const style =
    tone === 'accent'
      ? { background: `radial-gradient(circle at 85% 10%, rgb(255 255 255 / 0.18), transparent 50%), linear-gradient(160deg, ${accent}, ${shade(accent, ink === "#ffffff" ? -0.35 : 0.3)})`, color: ink }
      : tone === 'ink'
        ? { background: `radial-gradient(circle at 0% 0%, ${accent}55, transparent 55%), #0B0B0C`, color: '#FAFAFA' }
        : undefined
  return (
    <section
      aria-label={label}
      style={style}
      className={cn(
        'snap-start flex min-h-[70vh] flex-col justify-center rounded-3xl px-6 py-14 sm:px-12',
        tone === 'paper' && 'border border-neutral-200 dark:border-neutral-800 bg-background',
        className
      )}
    >
      {children}
    </section>
  )
}

const Kicker: FC<{ children: ReactNode }> = ({ children }) => <p className="text-sm font-semibold uppercase tracking-[0.2em] opacity-80">{children}</p>
const Big: FC<{ children: ReactNode }> = ({ children }) => <p className="mt-3 text-6xl sm:text-8xl font-display font-semibold tracking-tight tabular-nums leading-none">{children}</p>
const Line: FC<{ children: ReactNode }> = ({ children }) => (children ? <p className="mt-5 max-w-xl text-lg sm:text-2xl font-medium leading-snug opacity-90">{children}</p> : null)

const Stars: FC<{ rating: number }> = ({ rating }) => (
  <span aria-label={`${rating} stars`} className="text-2xl tracking-wider">
    {'★'.repeat(Math.floor(rating))}
    {ratingGlyphs(rating % 1)}
  </span>
)

const BookFeature: FC<{ book: WrappedData['longestBook']; accent: string; children: ReactNode }> = ({ book, accent, children }) =>
  book ? (
    <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end">
      <BookCover book={book} sizes="160px" className="w-32 sm:w-40 shrink-0 shadow-2xl" />
      <div className="min-w-0">
        <p className="text-2xl sm:text-4xl font-bold leading-tight">{book.title}</p>
        <p className="mt-1 text-lg opacity-80"><AuthorLink author={book.author} /></p>
        {children}
      </div>
    </div>
  ) : null

const WrappedView: FC<WrappedViewProps> = ({ wrapped: w, username, accent, own, years }) => {
  const voice: copy.Voice = { own, name: username }
  const title = own ? `Your ${w.year} in books` : `${username}'s ${w.year} in books`
  const shareUrl = `/u/${encodeURIComponent(username)}/wrapped/${w.year}`
  const otherYears = years.filter((y) => y !== w.year)
  const yearLinks = otherYears.length > 0 && (
    <nav aria-label="Other years" className="flex flex-wrap justify-center gap-2">
      {otherYears.map((y) => (
        <Link key={y} href={own ? `/wrapped/${y}` : `/u/${encodeURIComponent(username)}/wrapped/${y}`} className="rounded-full border border-neutral-300 dark:border-neutral-700 px-3 py-1 text-sm tabular-nums transition hover:bg-neutral-100 dark:hover:bg-neutral-900">
          {y}
        </Link>
      ))}
    </nav>
  )

  if (w.books === 0) {
    return (
      <div className="space-y-6">
        <Card tone="ink" accent={accent} label={title}>
          <Kicker>Bookmark Wrapped</Kicker>
          <h1 className="mt-3 text-4xl sm:text-6xl font-display font-semibold tracking-[-0.02em]">{title}</h1>
          <Line>
            {own
              ? w.isCurrentYear
                ? `No finished books dated ${w.year} yet. Finish one and this starts filling in.`
                : `No finished books dated ${w.year}. If you read them somewhere else, bring them over and this fills in.`
              : `${username} hasn't finished a book dated ${w.year} on Bookmark.`}
          </Line>
          {own && (
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/import" className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-200">
                Import your reading history
              </Link>
              <Link href="/stats" className="rounded-md border border-white/40 px-4 py-2 text-sm font-semibold transition hover:bg-white/10">
                See your stats
              </Link>
            </div>
          )}
        </Card>
        {yearLinks}
      </div>
    )
  }

  const busiest = w.busiestMonth
  const peak = Math.max(1, ...w.months.map((m) => m.books))

  return (
    <div className="space-y-6">
      <Card tone="ink" accent={accent} label="Introduction">
        <Kicker>Bookmark Wrapped</Kicker>
        <h1 className="mt-3 text-5xl sm:text-7xl font-display font-semibold tracking-[-0.02em] leading-[0.95]">{title}</h1>
        <Line>{copy.introLine(w, voice)}</Line>
        <p className="mt-10 text-sm opacity-70">Scroll down ↓</p>
      </Card>

      <Card tone="accent" accent={accent} label="Books and pages">
        <Kicker>Books finished</Kicker>
        <Big>{fmt(w.books)}</Big>
        <Line>{copy.booksLine(w, voice)}</Line>
        <div className="mt-10 border-t pt-8" style={{ borderColor: 'currentcolor' }}>
          <Kicker>Pages turned</Kicker>
          <Big>{fmt(w.pages)}</Big>
          <Line>{copy.pagesLine(w.pages)}</Line>
        </div>
      </Card>

      {busiest && (
        <Card tone="paper" accent={accent} label="Busiest month">
          <Kicker>Busiest month</Kicker>
          <Big>{copy.MONTHS[busiest.month]}</Big>
          <Line>{copy.busiestLine(w, voice)}</Line>
          {/* The year at a glance, the busiest month in the accent. */}
          <div aria-hidden className="mt-10 flex h-28 items-end gap-1 sm:gap-2">
            {w.months.map((m, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <div
                  className={cn('w-full max-w-10 rounded-t-[4px]', i === busiest.month ? 'bg-[var(--accent)]' : 'bg-neutral-300 dark:bg-neutral-700')}
                  style={{ height: m.books ? `${(m.books / peak) * 100}%` : 2 }}
                />
                <span className="text-[11px] text-muted-foreground">{copy.MONTHS[i][0]}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {w.topGenre && (
        <Card tone="ink" accent={accent} label="Top genre">
          <Kicker>Top genre</Kicker>
          <Big>{w.topGenre.name}</Big>
          <Line>{copy.genreLine(w, voice)}</Line>
          {w.topAuthor && w.topAuthor.count > 1 && (
            <Line>
              Most-read author: <AuthorLink author={w.topAuthor.name} className="font-bold" />, {copy.plural(w.topAuthor.count, 'book')}.
            </Line>
          )}
        </Card>
      )}

      {w.topRated && (
        <Card tone="accent" accent={accent} label="Top-rated book">
          <Kicker>{own ? 'Your favourite' : `${username}'s favourite`}</Kicker>
          <BookFeature book={w.topRated} accent={accent}>
            <p className="mt-3"><Stars rating={w.topRated.rating} /></p>
          </BookFeature>
          <Line>{copy.topRatedLine(w)}</Line>
        </Card>
      )}

      {w.longestBook && w.longestBook.id !== w.topRated?.id && (
        <Card tone="paper" accent={accent} label="Longest book">
          <Kicker>The big one</Kicker>
          <BookFeature book={w.longestBook} accent={accent}>{null}</BookFeature>
          <Line>{copy.longestLine(w, voice)}</Line>
        </Card>
      )}
      {w.longestBook && w.longestBook.id === w.topRated?.id && (
        <Card tone="paper" accent={accent} label="Longest book">
          <Kicker>The big one</Kicker>
          <Line>{`The favourite was also the longest: ${copy.longestLine(w, voice)}`}</Line>
        </Card>
      )}

      {w.medals.length > 0 && (
        <Card tone="ink" accent={accent} label="Medals earned">
          <Kicker>Medals earned</Kicker>
          <Big>{fmt(w.medals.length)}</Big>
          <Line>{copy.medalsLine(w.medals.length, voice)}</Line>
          <ul className="mt-10 grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-6">
            {w.medals.slice(-12).map((m) => (
              <li key={m.key} className="flex flex-col items-center text-center">
                <Medal achievementKey={m.achievementKey} earned className="w-16 sm:w-20" />
                <span className="mt-2 text-sm font-semibold leading-tight">{m.title}</span>
                <span className="text-xs opacity-70">{m.achievement}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card tone="paper" accent={accent} label="Reader tier">
        <Kicker>Reader tier</Kicker>
        {w.tier ? (
          <p className="mt-4">
            <span
              className="inline-block rounded-full px-6 py-3 text-4xl sm:text-6xl font-display font-semibold text-neutral-900"
              style={{ background: `linear-gradient(135deg, ${w.tier.light}, ${w.tier.colour} 55%, ${w.tier.shade})` }}
            >
              {w.tier.label}
            </span>
          </p>
        ) : (
          <Big>{fmt(w.tierBooks)}</Big>
        )}
        <Line>{copy.tierLine(w, voice)}</Line>
      </Card>

      <Card tone="accent" accent={accent} label="Reading goal">
        <Kicker>{w.year} goal</Kicker>
        <Big>{copy.goalHeadline(w)}</Big>
        <Line>{copy.goalLine(w, voice)}</Line>
        <Line>{copy.dnfLine(w.dnf, voice)}</Line>
      </Card>

      <Card tone="ink" accent={accent} label="Share" className="items-center text-center">
        <Kicker>That&apos;s a wrap</Kicker>
        <p className="mt-4 max-w-xl text-3xl sm:text-5xl font-display font-semibold tracking-tight leading-tight">{copy.outroLine(w, voice)}</p>
        {own ? (
          <WrappedShare
            shareUrl={shareUrl}
            storyUrl={`${shareUrl}/story`}
            fileName={`bookmark-wrapped-${w.year}.png`}
            title={`My ${w.year} in books`}
          />
        ) : (
          <Link href="/register" className="mt-8 rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-200">
            Make your own on Bookmark. It&apos;s free.
          </Link>
        )}
      </Card>

      {yearLinks}
    </div>
  )
}

export default WrappedView
