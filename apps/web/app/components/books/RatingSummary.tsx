import { FC } from 'react'
import StarRating from '../StarRating'
import type { RatingSummary as Summary } from '@/lib/workReviewRules'

const formatCount = (n: number) => n.toLocaleString('en-GB')

// A book page's Bookmark rating: the average, how many readers it's from, and how their stars spread.
// Before anyone has rated the book, empty stars and a line saying so, so its panel isn't a blank box.
const RatingSummary: FC<{ summary: Summary | null }> = ({ summary }) => {
  if (!summary) return (
    <section aria-labelledby="rating-heading" className="flex items-center gap-4">
      <h2 id="rating-heading" className="sr-only">Rating on Bookmark</h2>
      <StarRating value={0} readOnly size={28} label="No ratings yet" />
      <div>
        <p className="text-base font-medium">No ratings yet</p>
        <p className="text-sm text-muted-foreground">Rate it when you finish it and yours will be the first.</p>
      </div>
    </section>
  )
  const most = Math.max(...summary.stars)

  return (
    <section aria-labelledby="rating-heading" className="flex flex-col gap-5">
      <h2 id="rating-heading" className="sr-only">Rating on Bookmark</h2>
      <div className="flex items-center gap-4">
        <p className="font-display text-6xl sm:text-7xl font-semibold leading-none tabular-nums">{summary.average.toFixed(1)}</p>
        <div>
          <StarRating value={Math.round(summary.average * 4) / 4} readOnly size={28} label="Average rating" />
          <p className="mt-1.5 text-base text-muted-foreground">
            from {formatCount(summary.count)} {summary.count === 1 ? "reader" : "readers"}
          </p>
        </div>
      </div>
      <dl className="flex w-full max-w-md flex-col gap-1">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = summary.stars[star - 1]
          return (
            <div key={star} className="flex items-center gap-2 text-xs">
              <dt className="w-10 shrink-0 text-muted-foreground">{star} {star === 1 ? "star" : "stars"}</dt>
              <dd className="flex flex-1 items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" aria-hidden>
                  <span className="block h-full rounded-full bg-brand" style={{ width: most ? `${(count / most) * 100}%` : 0 }} />
                </span>
                <span className="w-8 text-right tabular-nums text-muted-foreground">{formatCount(count)}</span>
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

export default RatingSummary
