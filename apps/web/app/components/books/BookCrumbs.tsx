"use client"
import { FC, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import { CameFrom, readCameFrom } from '@/lib/cameFrom'

const crumbClass = "inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

// Home, always, then the page you opened this book from (Discover, someone's profile, a list) when that
// wasn't Home itself. Read after mount, as it lives in this tab's sessionStorage; a book opened straight
// from a link shows Home alone.
const BookCrumbs: FC<{ homeHref: string }> = ({ homeHref }) => {
  const [from, setFrom] = useState<CameFrom | null>(null)
  useEffect(() => {
    const value = readCameFrom()
    setFrom(value && value.path !== homeHref && value.path !== "/" ? value : null)
  }, [homeHref])

  return (
    <nav aria-label="Breadcrumb" className="-my-3 self-start min-w-0 max-w-full">
      <ol className="flex min-w-0 items-center gap-1.5">
        <li className="shrink-0">
          <Link href={homeHref} className={crumbClass}><Home size={15} aria-hidden />Home</Link>
        </li>
        {from && (
          <li className="flex min-w-0 items-center gap-1.5">
            <ChevronRight size={14} aria-hidden className="shrink-0 text-muted-foreground" />
            <Link href={from.path} className={`${crumbClass} min-w-0`}><span className="truncate">{from.label}</span></Link>
          </li>
        )}
      </ol>
    </nav>
  )
}

export default BookCrumbs
