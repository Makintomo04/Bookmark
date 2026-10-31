import { FC } from 'react'
import Link from 'next/link'
import { topMedals } from '@bookmark/shared/medals'
import Medal from './Medal'
import { SeeAllLink } from '../books/shelf'

// No "use client": the public profile renders this on the server.

interface MedalShowcaseProps {
  // Earned milestone keys ("BOOKS_READ:25"). The three furthest up their ladders are shown.
  earned: { key: string }[]
  // Their achievements page: /achievements for the owner, /u/<username>/achievements for anyone else.
  href: string
  // One medal per row, for a narrow column (the profile in bands).
  stacked?: boolean
}

// A reader's best three medals under their profile header, picked automatically (topMedals, as on the
// share image). Nothing until they've earned one.
const MedalShowcase: FC<MedalShowcaseProps> = ({ earned, href, stacked = false }) => {
  const medals = topMedals(earned)
  if (medals.length === 0) return null

  return (
    <section aria-labelledby="medal-showcase-heading" className="mt-5">
      {/* The same heading as Reviews and Authors you follow, which sit above it in the profile's column. */}
      <div className="mb-5 flex min-h-10 items-center justify-between gap-4">
        <h2 id="medal-showcase-heading" className="text-lg font-semibold">Top medals</h2>
        <SeeAllLink href={href} />
      </div>
      <ul className={stacked ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 gap-2 min-[480px]:grid-cols-3"}>
        {medals.map((m) => (
          <li key={m.key}>
            <Link
              href={href}
              className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-neutral-800 dark:hover:bg-neutral-900"
            >
              <Medal achievementKey={m.key} earned className="w-10 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{m.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{m.achievement}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default MedalShowcase
