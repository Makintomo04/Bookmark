"use client"
import { FC, useState } from 'react'
import Image from 'next/image'
import type { Book } from '@prisma/client'
import { cn } from '@/lib/utils'
import { isOpenLibraryCover } from '@/utils/helpers'

function parseColour(colour: string): [number, number, number] | null {
  const hex = colour.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
  }
  const rgb = colour.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
}

function readableInk(colour: string) {
  const rgb = parseColour(colour)
  if (!rgb) return '#ffffff'
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? '#ffffff' : '#111111'
}

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
