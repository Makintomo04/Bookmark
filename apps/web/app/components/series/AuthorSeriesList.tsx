import { FC } from 'react'
import FollowSeriesButton from './FollowSeriesButton'
import type { AuthorSeries } from '@/lib/seriesFollows'

interface AuthorSeriesListProps {
  series: AuthorSeries[]
  signedIn: boolean
  returnTo: string
}

// "Series" on an author page: each series of theirs we know of, with Follow series. Left out when there
// are none.
const AuthorSeriesList: FC<AuthorSeriesListProps> = ({ series, signedIn, returnTo }) => {
  if (series.length === 0) return null
  return (
    <section aria-labelledby="author-series-heading" className="flex flex-col gap-4">
      <h2 id="author-series-heading" className="font-display text-xl font-semibold">Series</h2>
      <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800 max-w-2xl">
        {series.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{s.name}</p>
              <p className="text-xs text-muted-foreground">{s.count === 1 ? "1 book on Bookmark" : `${s.count} books on Bookmark`}</p>
            </div>
            <FollowSeriesButton name={s.name} author={s.author} initialFollowing={s.isFollowing} signedIn={signedIn} returnTo={returnTo} className="shrink-0" />
          </li>
        ))}
      </ul>
    </section>
  )
}

export default AuthorSeriesList
