"use client"
import { FC, useState } from 'react'
import Image from 'next/image'
import type { Book } from '@prisma/client'
import { cn } from '@/lib/utils'
import { isOpenLibraryCover } from '@/utils/helpers'
import { coverColour, readableInk, shade } from '@/lib/colour'

interface BookFallbackProps {
  title: string
  author?: string | null
  // The reader's own colour for this book; otherwise one is picked from the title and author.
  colour?: string | null
  // grid: title and author; thumb: title only; blank: just the book, where the title is printed beside it.
  variant?: 'grid' | 'thumb' | 'blank'
  className?: string
}

// A coverless book drawn as a book: palette colour, darker spine, a soft sheen and the title in the display serif.
// Fills its (positioned) parent. Type is sized against the cover's width, so one layout works from 40px to 200px.
export const BookFallback: FC<BookFallbackProps> = ({ title, author, colour, variant = 'grid', className }) => {
  const background = colour || coverColour(title, author)
  const ink = readableInk(background)
  return (
    <div
      aria-hidden
      style={{ background, color: ink, containerType: 'inline-size' }}
      className={cn("absolute inset-0 overflow-hidden ring-1 ring-inset ring-black/10 dark:ring-white/10", className)}
    >
      <div style={{ background: shade(background, -0.3) }} className="absolute inset-y-0 left-0 w-[7%] border-r border-white/20" />
      <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(255,255,255,0.16),transparent_40%,transparent_70%,rgba(0,0,0,0.16))]" />
      {variant === 'grid' ? (
        // Top padding keeps the title clear of the action buttons laid over the cover.
        <div className="relative flex h-full flex-col justify-between py-[10%] pl-[16%] pr-[9%] pt-12">
          <div>
            <p className="font-display font-semibold leading-[1.15] break-words line-clamp-5 text-[clamp(10px,12cqw,22px)]">{title}</p>
            <div className="mt-[8%] h-px w-1/4 opacity-50" style={{ background: ink }} />
          </div>
          {author && <p className="font-medium opacity-80 line-clamp-2 text-[clamp(8px,7.5cqw,13px)]">{author}</p>}
        </div>
      ) : variant === 'thumb' && (
        <p className="relative py-[10%] pl-[14%] pr-[6%] font-display font-semibold leading-tight break-words line-clamp-5 text-[clamp(7px,15cqw,13px)]">{title}</p>
      )}
    </div>
  )
}

interface BookCoverProps {
  book: Pick<Book, 'title' | 'author' | 'coverImage' | 'cardColour'>
  sizes: string
  variant?: 'grid' | 'thumb'
  className?: string
}

const BookCover: FC<BookCoverProps> = ({ book, sizes, variant = 'grid', className }) => {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <div className={cn("relative aspect-[2/3] w-full overflow-hidden rounded-md bg-neutral-200 dark:bg-neutral-800", className)}>
      {book.coverImage && !imageFailed ? (
        <Image src={book.coverImage} alt="" fill sizes={sizes} unoptimized={isOpenLibraryCover(book.coverImage)} className="object-cover" onError={() => setImageFailed(true)} />
      ) : (
        <BookFallback title={book.title} author={book.author} colour={book.cardColour} variant={variant} />
      )}
    </div>
  )
}

export default BookCover
