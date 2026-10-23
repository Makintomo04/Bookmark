"use client"
import { FC, Fragment } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { authorHref, authorNames, isLinkableAuthor } from '@/lib/authorNames'

interface AuthorLinkProps {
  // The credit as stored, possibly joint ("Neil Gaiman & Terry Pratchett").
  author: string | null | undefined
  className?: string
  linkClassName?: string
  // E.g. closing the modal the link sits in.
  onNavigate?: () => void
}

// Each person in a credit links to their author page; placeholders ("Unknown") stay plain text. Safe
// inside a clickable card: the click stops here, and the cards' key handlers ignore events from children.
const AuthorLink: FC<AuthorLinkProps> = ({ author, className, linkClassName, onNavigate }) => {
  const names = authorNames(author)
  if (names.length === 0) return <span className={className}>{author}</span>
  return (
    <span className={className}>
      {names.map((name, i) => (
        <Fragment key={`${name}-${i}`}>
          {i > 0 && (i === names.length - 1 ? " & " : ", ")}
          {isLinkableAuthor(name) ? (
            <Link
              href={authorHref(name)}
              onClick={(e) => {
                e.stopPropagation()
                onNavigate?.()
              }}
              className={cn("hover:underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:underline", linkClassName)}
            >
              {name}
            </Link>
          ) : name}
        </Fragment>
      ))}
    </span>
  )
}

export default AuthorLink
