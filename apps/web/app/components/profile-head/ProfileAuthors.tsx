"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import { ShelfSection } from '../books/shelf'
import useCollapsedSections from '@/app/hooks/useCollapsedSections'

interface ProfileAuthorsProps {
  authors: { name: string; slug: string }[]
  // Your own profile says how to add one; someone else's leaves the section out when it's empty.
  isSelf?: boolean
  // In bands: no section at all when there are none, even your own, and only the first `cap` until
  // "+N more" opens the rest in place, so the band beside reviews stays short.
  cap?: number
}

// "Authors they follow" on a profile, each linking to the author's page (where Follow / Following is).
const ProfileAuthors: FC<ProfileAuthorsProps> = ({ authors, isSelf = false, cap }) => {
  const collapse = useCollapsedSections()
  const [all, setAll] = useState(false)
  if (authors.length === 0 && (!isSelf || cap)) return null
  const shown = cap && !all ? authors.slice(0, cap) : authors
  const chipClass = "inline-flex items-center h-9 px-4 rounded-full border border-neutral-300 dark:border-neutral-700 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  return (
    <ShelfSection id="profile-authors" title={isSelf ? "Authors you follow" : "Authors they follow"} count={authors.length} {...(isSelf ? collapse("profile-authors") : {})}>
      {authors.length === 0 ? (
        <p className="text-sm text-muted-foreground">Follow an author from their page and they&apos;ll show here.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {shown.map((author) => (
            <li key={author.slug}>
              <Link href={`/authors/${encodeURIComponent(author.slug)}`} className={chipClass}>
                {author.name}
              </Link>
            </li>
          ))}
          {shown.length < authors.length && (
            <li>
              <button type="button" onClick={() => setAll(true)} className={`${chipClass} border-dashed text-muted-foreground`}>
                +{authors.length - shown.length} more
              </button>
            </li>
          )}
        </ul>
      )}
    </ShelfSection>
  )
}

export default ProfileAuthors
