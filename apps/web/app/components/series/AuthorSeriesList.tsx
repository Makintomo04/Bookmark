import { FC } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { seriesHref } from '@/lib/series'
import FollowSeriesButton from './FollowSeriesButton'
import type { AuthorSeries } from '@/lib/seriesFollows'

interface AuthorSeriesListProps {
  series: AuthorSeries[]
  signedIn: boolean
  returnTo: string
}

// "Series" on an author page: each series of theirs we know of, opening its page, with Follow series. Left
// out when there are none.
const AuthorSeriesList: FC<AuthorSeriesListProps> = ({ series, signedIn, returnTo }) => {
  if (series.length === 0) return null
  return (
    <section aria-labelledby="author-series-heading" className="flex flex-col gap-4">
      <h2 id="author-series-heading" className="font-display text-xl font-semibold">Series</h2>
      <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800 max-w-2xl">
        {series.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-4 py-3">
            <Link href={seriesHref(s.name, s.author)} className="group flex min-w-0 flex-1 items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="min-w-0">
                <p className="font-medium truncate underline-offset-2 group-hover:underline">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.count === 1 ? "1 book on Bookmark" : `${s.count} books on Bookmark`}</p>
              </div>
              <ChevronRight size={16} aria-hidden className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
            <FollowSeriesButton name={s.name} author={s.author} initialFollowing={s.isFollowing} signedIn={signedIn} returnTo={returnTo} className="shrink-0" />
          </li>
        ))}
      </ul>
    </section>
  )
}

export default AuthorSeriesList
