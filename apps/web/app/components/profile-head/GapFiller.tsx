"use client"
import { FC, ReactNode, useEffect, useRef, useState } from 'react'

// How much empty space beside the books it takes before the column is filled, in px; the filler also has to fit.
const MIN_GAP = 80

// At the foot of your header's column in bands (ProfileHeader's identityFooter): shown only when the books
// beside the column run so much longer that it would otherwise leave a hole under it. It's measured, as the
// gap depends on how many books you're reading and what's next, not on anything known up front.
const GapFiller: FC<{ children: ReactNode }> = ({ children }) => {
  const self = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const grid = self.current?.closest('[data-top-grid]')
    const identity = grid?.querySelector<HTMLElement>('[data-identity]')
    const books = grid?.querySelector<HTMLElement>('[data-books]')
    if (!self.current || !identity || !books) return
    const measure = () => {
      const own = self.current?.offsetHeight ?? 0
      const gap = books.offsetHeight - (identity.offsetHeight - (show ? own : 0))
      setShow(gap > MIN_GAP && gap >= own)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(books)
    return () => observer.disconnect()
  }, [show])
  // Laid out but invisible while hidden, so its height is known.
  return <div ref={self} aria-hidden={!show} className={show ? undefined : "invisible absolute"}>{children}</div>
}

export default GapFiller
