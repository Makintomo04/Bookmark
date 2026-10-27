import { FC } from 'react'
import Link from 'next/link'
import { ShelfSection } from '../books/shelf'

interface ProfileAuthorsProps {
  authors: { name: string; slug: string }[]
  // Your own profile says how to add one; someone else's leaves the section out when it's empty.
  isSelf?: boolean
}

// "Authors they follow" on a profile, each linking to the author's page (where Follow / Following is).
const ProfileAuthors: FC<ProfileAuthorsProps> = ({ authors, isSelf = false }) => {
  if (authors.length === 0 && !isSelf) return null
  return (
    <ShelfSection id="profile-authors" title={isSelf ? "Authors you follow" : "Authors they follow"} count={authors.length}>
      {authors.length === 0 ? (
        <p className="text-sm text-muted-foreground">Follow an author from their page and they&apos;ll show here.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {authors.map((author) => (
            <li key={author.slug}>
              <Link
                href={`/authors/${encodeURIComponent(author.slug)}`}
                className="inline-flex items-center h-9 px-4 rounded-full border border-neutral-300 dark:border-neutral-700 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {author.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ShelfSection>
  )
}

export default ProfileAuthors
