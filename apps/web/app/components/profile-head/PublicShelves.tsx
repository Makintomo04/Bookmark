"use client"
import { FC, useMemo, useState } from 'react'
import { ArrowUpDown } from 'lucide-react'
import type { Book } from '@prisma/client'
import { cn } from '@/lib/utils'
import { SHELF_SORTS, SHELF_TITLE, SORT_LABEL, sortBooks, type ShelfKey, type ShelfSort } from '@/lib/shelfFilter'
import BookCoverCard from '../cards/BookCoverCard'
import GrowingList from '../books/GrowingList'
import { coverOnlyGridClass } from '../books/shelf'
import { PillSelect } from '../books/ShelfToolbar'

interface PublicShelvesProps {
  wantToRead: Book[]
  finished: Book[]
  accentColour?: string | null
}

type Tab = Extract<ShelfKey, 'want' | 'finished'> | 'all'

// Someone else's shelves as tabs, as on your own profile (BookGrid's shelves slot): Want to read, Finished and
// All, with the same sort. Only the shelves their profile shows are here (lib/publicProfile.ts), so a shelf they
// keep to themselves, or an empty one, has no tab. Currently reading is above, in Reading now.
const PublicShelves: FC<PublicShelvesProps> = ({ wantToRead, finished, accentColour }) => {
  const [tab, setTab] = useState<Tab | null>(null)
  const [sort, setSort] = useState<ShelfSort>("recent")
  const byTab = useMemo(() => ({ want: wantToRead, finished, all: [...wantToRead, ...finished] }), [wantToRead, finished])
  const tabs = (['want', 'finished', 'all'] as Tab[]).filter((key) => byTab[key].length > 0)
  // With one shelf, "All" is the same books again.
  const shown = wantToRead.length > 0 && finished.length > 0 ? tabs : tabs.filter((key) => key !== 'all')
  const current = tab && shown.includes(tab) ? tab : shown[0]
  const items = useMemo(() => (current ? (sort === "recent" && current !== 'all' ? byTab[current] : sortBooks(byTab[current], sort)) : []), [byTab, current, sort])
  if (!current) return null

  return (
    <section aria-label="Shelves" className="w-full">
      <div className="mb-6 flex items-center gap-1 border-b border-neutral-200 pb-2 dark:border-neutral-800 sm:gap-3 sm:pb-3">
        <div role="tablist" aria-label="Shelves" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {shown.map((key) => (
            <button key={key} type="button" role="tab" aria-selected={key === current} onClick={() => setTab(key)}
              className={cn(
                "h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                key === current ? "bg-neutral-200 text-foreground dark:bg-neutral-800" : "text-muted-foreground hover:bg-neutral-100 hover:text-foreground dark:hover:bg-neutral-900",
              )}>
              {key === 'all' ? "All" : SHELF_TITLE[key]} <span className="tabular-nums opacity-70">{byTab[key].length.toLocaleString('en-GB')}</span>
            </button>
          ))}
        </div>
        <div className="shrink-0">
          <PillSelect label="Sort" icon={<ArrowUpDown size={15} aria-hidden className="shrink-0" />} value={sort}
            options={SHELF_SORTS.map((s) => ({ value: s, label: SORT_LABEL[s] }))} onChange={(v) => setSort(v as ShelfSort)} />
        </div>
      </div>
      <GrowingList items={items} className={coverOnlyGridClass} resetKey={`${current}|${sort}`}
        render={(book) => <BookCoverCard key={book.id} book={book} accentColour={accentColour} readOnly coversOnly />} />
    </section>
  )
}

export default PublicShelves
