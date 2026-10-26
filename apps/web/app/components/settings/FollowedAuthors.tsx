"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { notify } from '@/lib/notify'
import { Button } from '../ui/button'
import type { FollowedAuthor } from '@/lib/authorFollows'

// The authors the reader follows, each with a way to stop. Following happens on the author's page.
const FollowedAuthors: FC<{ initial: FollowedAuthor[] }> = ({ initial }) => {
  const [authors, setAuthors] = useState(initial)
  const [pending, setPending] = useState<string | null>(null)

  const unfollow = (author: FollowedAuthor) => {
    setPending(author.key)
    axios.delete(`/api/authors/${encodeURIComponent(author.slug)}/follow`)
      .then(() => setAuthors((list) => list.filter((a) => a.key !== author.key)))
      .catch(() => notify.error(`Couldn't unfollow ${author.name}. Try again.`, { retry: () => unfollow(author) }))
      .finally(() => setPending(null))
  }

  return (
    <div className="rounded-lg border p-4 flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">Authors you follow</p>
        <p className="text-xs text-muted-foreground">
          {authors.length ? "Follow more from any author's page." : "You're not following any authors yet. Tap Follow on an author's page to add them here."}
        </p>
      </div>
      {authors.length > 0 && (
        <ul className="flex flex-col divide-y">
          {authors.map((author) => (
            <li key={author.key} className="flex items-center justify-between gap-3 py-2">
              <Link href={`/authors/${encodeURIComponent(author.slug)}`} className="text-sm hover:underline underline-offset-2 truncate">{author.name}</Link>
              <Button type="button" variant="outline" size="sm" disabled={pending === author.key} onClick={() => unfollow(author)} aria-label={`Unfollow ${author.name}`} className="shrink-0">
                Unfollow
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default FollowedAuthors
