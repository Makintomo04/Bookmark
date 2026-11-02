"use client"
import { FC, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

interface AuthorPhotoProps {
  name: string
  photoUrl: string | null
  // Pixels; the circle and the image are the same size.
  size: number
  className?: string
  // Beside the author's name the photo adds nothing for a screen reader, so it can be hidden.
  decorative?: boolean
  // Told when the photo fails to load, for a caller that hides itself with nothing else to show.
  onFail?: () => void
}

// An author's photo in a circle, or their initials when there's none or it fails to load (Open Library
// answers a missing photo with a 404). Used on author pages and the book page's similar authors.
const AuthorPhoto: FC<AuthorPhotoProps> = ({ name, photoUrl, size, className, decorative, onFail }) => {
  const [failed, setFailed] = useState(false)
  const circle = cn('shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-900', className)
  if (!photoUrl || failed) {
    return (
      <span aria-hidden className={cn(circle, 'grid place-items-center font-semibold text-muted-foreground')} style={{ width: size, height: size, fontSize: size * 0.28 }}>
        {initials(name)}
      </span>
    )
  }
  // unoptimized: a librarian's photo can be on any https host, and the optimiser only takes the hosts in
  // next.config.mjs, so anything else would fail and drop to the initials.
  return (
    <Image src={photoUrl} alt={decorative ? '' : `Photo of ${name}`} width={size} height={size} unoptimized
      onError={() => { setFailed(true); onFail?.() }} className={cn(circle, 'object-cover')} style={{ width: size, height: size }} />
  )
}

export default AuthorPhoto
