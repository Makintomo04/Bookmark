"use client"
import { FC, useState } from 'react'
import Image from 'next/image'
import type { Book } from '@prisma/client'
import { cn } from '@/lib/utils'
import { isOpenLibraryCover } from '@/utils/helpers'
import { readableInk } from '@/lib/colour'

interface BookCoverProps {
  book: Pick<Book, 'title' | 'author' | 'coverImage' | 'cardColour'>
  fallbackColour?: string | null
  sizes: string
  variant?: 'grid' | 'thumb'
  className?: string
}

const BookCover: FC<BookCoverProps> = ({ book, fallbackColour, sizes, variant = 'grid', className }) => {
  const [imageFailed, setImageFailed] = useState(false)
  const background = book.cardColour || fallbackColour || '#3f3f46'

  return (
    <div className={cn("relative aspect-[2/3] w-full overflow-hidden rounded-md bg-neutral-200 dark:bg-neutral-800", className)}>
      {book.coverImage && !imageFailed ? (
        <Image src={book.coverImage} alt="" fill sizes={sizes} unoptimized={isOpenLibraryCover(book.coverImage)} className="object-cover" onError={() => setImageFailed(true)} />
      ) : variant === 'grid' ? (
        // Top padding keeps the title clear of the action buttons laid over the cover.
        <div style={{ background, color: readableInk(background) }} className="absolute inset-0 flex flex-col justify-between p-4 pt-12">
          <p className="text-xl font-bold leading-tight break-words line-clamp-6">{book.title}</p>
          <p className="text-sm font-medium opacity-80 line-clamp-2">{book.author}</p>
        </div>
      ) : (
        <div style={{ background, color: readableInk(background) }} className="absolute inset-0 p-2">
          <p className="text-xs font-bold leading-tight break-words line-clamp-5">{book.title}</p>
        </div>
      )}
    </div>
  )
}

export default BookCover
