import { FC } from 'react'
import Link from 'next/link'
import { CoverStack } from '../discover/ListCard'
import AuthorPhoto from '../authors/AuthorPhoto'
import { authorHref } from '@/lib/authorNames'
import type { SimilarAuthorWithPhoto } from '@/lib/similarAuthors'

interface SimilarAuthorsProps {
  authors: SimilarAuthorWithPhoto[]
  headingClassName?: string
}

// "Explore more from similar authors" on a book page: each author as a stack of their books, like a list
// card, with their photo over the books so it reads as a person rather than a list. Links to their page.
// The page leaves it out when there's nobody to show.
const SimilarAuthors: FC<SimilarAuthorsProps> = ({ authors, headingClassName }) => (
  <section aria-labelledby="similar-authors-heading" className="flex flex-col gap-4">
    <h2 id="similar-authors-heading" className={headingClassName}>Explore more from similar authors</h2>
    {/* A row to swipe through on a phone; a grid once there's room. */}
    <ul className="-mx-4 px-4 flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-5 overflow-x-auto sm:overflow-visible snap-x snap-mandatory pb-2">
      {authors.map((author) => (
        <li key={author.slug} className="w-56 shrink-0 sm:w-auto snap-start">
          <Link href={authorHref(author.name)} className="group flex flex-col gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4">
            {/* The photo sits on the stack's corner, over the books, ringed in the stack's own colour. */}
            <div className="relative">
              <CoverStack covers={author.books} />
              <AuthorPhoto name={author.name} photoUrl={author.photoUrl} size={56} decorative
                className="absolute left-3 bottom-3 z-10 shadow-md ring-4 ring-neutral-100 dark:ring-neutral-900 bg-neutral-200 dark:bg-neutral-800" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold leading-snug truncate group-hover:underline underline-offset-4">{author.name}</p>
              <p className="text-xs text-muted-foreground truncate">{author.books[0].title}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  </section>
)

export default SimilarAuthors
