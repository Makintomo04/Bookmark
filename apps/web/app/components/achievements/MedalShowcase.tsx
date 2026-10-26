import { FC } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { topMedals } from '@bookmark/shared/medals'
import Medal from './Medal'

// No "use client": the public profile renders this on the server.

interface MedalShowcaseProps {
  // Earned milestone keys ("BOOKS_READ:25"). The three furthest up their ladders are shown.
  earned: { key: string }[]
  // Their achievements page: /achievements for the owner, /u/<username>/achievements for anyone else.
  href: string
}

// A reader's best three medals under their profile header, picked automatically (topMedals, as on the
// share image). Nothing until they've earned one.
const MedalShowcase: FC<MedalShowcaseProps> = ({ earned, href }) => {
  const medals = topMedals(earned)
  if (medals.length === 0) return null

  return (
    <section aria-labelledby="medal-showcase-heading" className="mt-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="medal-showcase-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top medals</h2>
        <Link href={href} className="inline-flex items-center gap-0.5 text-sm text-muted-foreground transition hover:text-foreground">
          See all<ChevronRight size={14} aria-hidden />
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
        {medals.map((m) => (
          <li key={m.key}>
            <Link
              href={href}
              className="flex items-center gap-3 rounded-xl border border-neutral-200 p-2.5 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-neutral-800 dark:hover:bg-neutral-900"
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
