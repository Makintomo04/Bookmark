"use client"
import { FC } from 'react'
import useSWR from 'swr'
import { fetcher, swrOptions } from '@/lib/fetcher'
import type { ReaderCounts as Counts, ReaderGroup } from '@/lib/readerCounts'
import { CuratorAvatar } from '../lists/CuratorNote'

const formatCount = (n: number) => n.toLocaleString('en-GB')

const Group: FC<{ group: ReaderGroup, one: string, many: string }> = ({ group, one, many }) => (
  <div className="flex min-w-0 items-center gap-3">
    {group.people.length > 0 && (
      <div className="flex -space-x-1.5 shrink-0">
        {group.people.map((person, i) => (
          <CuratorAvatar key={person.username ?? i} person={person} size={28} className="ring-2 ring-background" />
        ))}
      </div>
    )}
    <p className="text-sm">
      <span className="font-semibold tabular-nums">{formatCount(group.count)}</span>{" "}
      <span className="text-muted-foreground">{group.count === 1 ? one : many}</span>
    </p>
  </div>
)

// Book details: how many readers are in the middle of this book and how many have it lined up.
// Nothing at all until someone has shelved it, so a new book doesn't open on two zeros.
// `bookKey`: the Open Library work key, or the catalogue Work id of a book Open Library lacks (bookKeyOf).
const ReaderCounts: FC<{ bookKey: string | null | undefined }> = ({ bookKey }) => {
  const { data } = useSWR<Counts>(bookKey ? `/api/books/readers?workKey=${encodeURIComponent(bookKey)}` : null, fetcher, swrOptions)
  if (!data || (data.reading.count === 0 && data.wantToRead.count === 0)) return null

  return (
    <section aria-label="Readers on Bookmark" className="flex flex-wrap items-center gap-x-8 gap-y-3">
      {data.reading.count > 0 && <Group group={data.reading} one="person is reading this" many="people are reading this" />}
      {data.wantToRead.count > 0 && <Group group={data.wantToRead} one="person wants to read this" many="people want to read this" />}
    </section>
  )
}

export default ReaderCounts
