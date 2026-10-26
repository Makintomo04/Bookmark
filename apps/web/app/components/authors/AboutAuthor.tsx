"use client"
import { FC, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import type { AuthorAbout } from '@/lib/authors'

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

// About the author, under the name on an author page: their photo, name, how many of their books are on
// Bookmark, and a short bio. A long bio opens with "Read more". Parts we don't have are left out.
const AboutAuthor: FC<{ name: string; about: AuthorAbout }> = ({ name, about }) => {
  const [open, setOpen] = useState(false)
  const { photoUrl, bio, bookCount } = about
  const long = bio.length > 1 || (bio[0]?.length ?? 0) > 320
  // Nothing to say beyond the name already in the heading: leave the section out rather than show an empty box.
  if (!photoUrl && bio.length === 0 && bookCount === 0) return null

  return (
    <section aria-labelledby="about-author-heading" className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800 sm:p-6">
      <h2 id="about-author-heading" className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">About the author</h2>
      <div className="flex items-center gap-4">
        {photoUrl ? (
          <Image src={photoUrl} alt={`Photo of ${name}`} width={72} height={72} className="size-[72px] shrink-0 rounded-full object-cover bg-neutral-100 dark:bg-neutral-900" />
        ) : (
          <span aria-hidden className="grid size-[72px] shrink-0 place-items-center rounded-full bg-neutral-100 text-xl font-semibold text-muted-foreground dark:bg-neutral-900">{initials(name)}</span>
        )}
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">{name}</p>
          {bookCount > 0 && <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">{bookCount} {bookCount === 1 ? 'book' : 'books'} on Bookmark</p>}
        </div>
      </div>
      {bio.length > 0 && (
        <div className="mt-4 max-w-3xl">
          <div className={cn('flex flex-col gap-3 text-sm leading-relaxed', !open && long && 'line-clamp-4')}>
            {(open ? bio : bio.slice(0, 1)).map((p, i) => <p key={i}>{p}</p>)}
          </div>
          {long && (
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
              {open ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

export default AboutAuthor
