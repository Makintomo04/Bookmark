"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useStaffCounts } from './staffCounts'
import CountBadge from './CountBadge'

const StaffNav = ({ tabs }: { tabs: { href: string, label: string }[] }) => {
  const pathname = usePathname()
  const hasReports = tabs.some((t) => t.href === '/staff/reports')
  // What's waiting, on the Reports tab.
  const { data: counts } = useStaffCounts(hasReports)
  return (
    <nav aria-label="Staff sections" className="mt-6 -mx-4 px-4 overflow-x-auto overflow-y-hidden border-b border-neutral-200 dark:border-neutral-800">
      <ul className="flex gap-1">
        {tabs.map(({ href, label }) => {
          // The overview is /staff itself, which every other tab starts with.
          const active = href === '/staff' ? pathname === href : !!pathname?.startsWith(href)
          const count = href === '/staff/reports' ? counts?.waiting ?? 0 : 0
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? 'page' : undefined}
                className={cn('inline-flex h-11 pointer-fine:h-10 items-center gap-1.5 px-3 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap',
                  active ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {label}
                {count > 0 && <CountBadge count={count} label={`${count} waiting`} />}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default StaffNav
