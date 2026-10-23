"use client"
import { FC, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '../ui/skeleton'

interface BookBlurbProps {
  description: string | null
  isLoading: boolean
  className?: string
}

// "About this book", clamped to a few lines with a toggle when it runs long.
// Renders nothing when there's no blurb, so books Open Library knows little about aren't cluttered.
const BookBlurb: FC<BookBlurbProps> = ({ description, isLoading, className }) => {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const textRef = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    setExpanded(false)
    const el = textRef.current
    setOverflows(!!el && el.scrollHeight > el.clientHeight + 1)
  }, [description])

  if (!isLoading && !description) return null

  return (
    <section aria-labelledby="book-blurb-heading" className={className}>
      <h3 id="book-blurb-heading" className="text-sm font-medium">About this book</h3>
      {isLoading ? (
        <div className="mt-2 flex flex-col gap-2" aria-label="Loading description">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      ) : (
        <>
          <p
            id="book-blurb-text"
            ref={textRef}
            className={cn("mt-1.5 text-sm leading-relaxed text-muted-foreground whitespace-pre-line", !expanded && "line-clamp-4")}
          >
            {description}
          </p>
          {(overflows || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-controls="book-blurb-text"
              className="mt-1 text-sm font-medium underline underline-offset-4 hover:text-muted-foreground"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </>
      )}
    </section>
  )
}

export default BookBlurb
