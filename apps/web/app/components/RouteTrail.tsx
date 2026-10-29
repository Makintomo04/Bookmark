"use client"
import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { crumbLabel, isBookPath, writeCameFrom } from '@/lib/cameFrom'

// The page title updates a moment after the address does, so the label is read once it has settled.
const TITLE_SETTLE_MS = 400

// Notes each page you visit (other than a book's own) so a book page's breadcrumb can lead back to it.
const RouteTrail = () => {
  const pathname = usePathname()
  const search = useSearchParams()?.toString() ?? ""

  useEffect(() => {
    if (!pathname || isBookPath(pathname)) return
    const path = search ? `${pathname}?${search}` : pathname
    writeCameFrom({ path, label: crumbLabel(path, "") })
    const timer = setTimeout(() => writeCameFrom({ path, label: crumbLabel(path, document.title) }), TITLE_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [pathname, search])

  return null
}

export default RouteTrail
