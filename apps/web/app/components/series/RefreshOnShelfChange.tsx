"use client"
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useBooks from '@/app/hooks/useBooks'

// A server-rendered page that shows where the reader is (a series' "2 of 7 read" and Up next) reloads it
// whenever their shelf changes, from whichever button, modal or undo changed it. Every save reloads the
// shelf, and SWR keeps the same data object when nothing changed, so a refetch alone doesn't refresh.
const RefreshOnShelfChange = () => {
  const router = useRouter()
  const { books } = useBooks()
  const seen = useRef(books)

  useEffect(() => {
    if (books === seen.current) return
    const first = seen.current === undefined
    seen.current = books
    // The first load is what the page was rendered from.
    if (!first) router.refresh()
  }, [books, router])

  return null
}

export default RefreshOnShelfChange
