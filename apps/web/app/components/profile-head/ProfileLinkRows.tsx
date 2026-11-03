import { FC } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ProfileLinkRow {
  label: string
  href: string
  // A count on the right, before the chevron.
  count?: number
}

// The profile's ways further in (achievements, stats) as plain rows under hairlines, rather than boxed
// medal cards in the header's column (BOO-97).
const ProfileLinkRows: FC<{ rows: ProfileLinkRow[]; className?: string }> = ({ rows, className }) => {
  if (rows.length === 0) return null
  return (
    <nav aria-label="More from this profile" className={cn("border-t border-neutral-200 dark:border-neutral-800", className)}>
      <ul>
        {rows.map((row) => (
          <li key={row.href} className="border-b border-neutral-200 dark:border-neutral-800">
            <Link href={row.href} className="flex min-h-12 items-center justify-between gap-3 text-sm transition hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span>{row.label}</span>
              <span className="flex items-center gap-1 text-muted-foreground tabular-nums">
                {row.count !== undefined && row.count}
                <ChevronRight size={16} aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default ProfileLinkRows
