import { FC, ReactNode } from 'react'
import { Book, Status } from '@prisma/client'

const time = (date: Date | string | null) => (date ? new Date(date).getTime() : 0)
const normalize = (s: string) => s.trim().toLowerCase()

export function groupShelf(books: Book[]) {
  return {
    reading: books.filter((b) => b.status === Status.STARTED)
      .sort((a, b) => time(b.startedAt) - time(a.startedAt)),
    wantToRead: books.filter((b) => b.status === Status.NOT_STARTED)
      .sort((a, b) => time(b.createdAt) - time(a.createdAt)),
    finished: books.filter((b) => b.status === Status.COMPLETED)
      .sort((a, b) => time(b.completedAt) - time(a.completedAt)),
  }
}

// True when a currently-reading book has been finished before: either this
// same entry was restarted (timesRead survives a restart), or an earlier,
// separate entry for the same title/author sits in the finished shelf.
export function isRereading(book: Book, finished: Book[]) {
  if (book.timesRead > 0) return true
  return finished.some((f) => f.id !== book.id
    && normalize(f.title) === normalize(book.title)
    && normalize(f.author) === normalize(book.author))
}

// Two columns when the count would leave an orphan in a row of three.
export function readingGridCols(count: number) {
  return count % 3 === 0 || count > 4 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2"
}

export const coverGridClass = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-8"

export const ShelfSection: FC<{ id: string; title: string; count: number; action?: ReactNode; children: ReactNode }> = ({ id, title, count, action, children }) => (
  <section aria-labelledby={id} className="mt-12 first:mt-0">
    <div className="mb-5 flex items-center justify-between gap-4 min-h-10">
      <h2 id={id} className="flex items-baseline gap-2 text-lg font-semibold">
        {title}
        <span className="text-sm font-normal text-muted-foreground tabular-nums">{count}</span>
      </h2>
      {action}
    </div>
    {children}
  </section>
)
