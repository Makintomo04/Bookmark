"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const StaffNav = ({ tabs }: { tabs: { href: string, label: string }[] }) => {
  const pathname = usePathname()
  return (
    <nav aria-label="Staff sections" className="mt-6 -mx-4 px-4 overflow-x-auto overflow-y-hidden border-b border-neutral-200 dark:border-neutral-800">
      <ul className="flex gap-1">
        {tabs.map(({ href, label }) => {
          const active = !!pathname?.startsWith(href)
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? 'page' : undefined}
                className={cn('inline-flex h-10 items-center px-3 text-sm font-medium border-b-2 -mb-px transition',
                  active ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default StaffNav
