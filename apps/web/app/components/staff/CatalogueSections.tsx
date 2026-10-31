"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const SECTIONS = [
  { href: '/staff/catalogue', label: 'Books' },
  { href: '/staff/catalogue/duplicates', label: 'Possible duplicates' },
  { href: '/staff/catalogue/authors', label: 'Authors' },
  { href: '/staff/catalogue/series', label: 'Series' },
]

// Books, possible duplicates, authors and series within the Catalogue tab.
const CatalogueSections = () => {
  const pathname = usePathname()
  return (
    <nav aria-label="Catalogue sections" className="flex gap-1 overflow-x-auto">
      {SECTIONS.map(({ href, label }) => {
        const active = pathname === href
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}
            className={cn('inline-flex h-11 pointer-fine:h-9 items-center rounded-md px-3 text-sm font-medium transition',
              active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent')}>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export default CatalogueSections
