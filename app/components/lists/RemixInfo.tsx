import { FC } from 'react'
import Link from 'next/link'
import { Shuffle } from 'lucide-react'

interface RemixInfoProps {
  // Set on a remix. `list` is null when the original is gone or no longer visible to this viewer.
  forkedFrom: { list: { id: string, title: string, username: string | null } | null } | null
  remixCount: number
}

// Where a list came from, and how many readers have made it their own.
const RemixInfo: FC<RemixInfoProps> = ({ forkedFrom, remixCount }) => {
  if (!forkedFrom && remixCount === 0) return null
  const origin = forkedFrom?.list
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      {forkedFrom && (
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <Shuffle size={14} aria-hidden className="shrink-0" />
          {origin ? (
            <span className="min-w-0">
              Remixed from <Link href={`/lists/${origin.id}`} className="font-medium text-foreground hover:underline underline-offset-4">{origin.title}</Link>
              {origin.username && <> by <Link href={`/u/${origin.username}`} className="font-medium text-foreground hover:underline underline-offset-4">@{origin.username}</Link></>}
            </span>
          ) : (
            <span>Remixed from another reader&apos;s list</span>
          )}
        </span>
      )}
      {remixCount > 0 && (
        <span className="inline-flex items-center gap-1.5">
          {!forkedFrom && <Shuffle size={14} aria-hidden />}
          {forkedFrom && <span aria-hidden>·</span>}
          {remixCount === 1 ? "1 reader copied this list" : `${remixCount} readers copied this list`}
        </span>
      )}
    </p>
  )
}

export default RemixInfo
