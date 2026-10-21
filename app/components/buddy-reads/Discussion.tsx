"use client"
import { FC, Fragment } from 'react'
import { Lock } from 'lucide-react'
import { buildTimeline, formatPercent, type SerializedComment } from '@/lib/buddyReads'
import CommentItem from './CommentItem'
import CommentComposer from './CommentComposer'

interface DiscussionProps {
  buddyReadId: string
  comments: SerializedComment[]
  viewerProgress: number
  isHost: boolean
  canPost: boolean
  onChange: () => void
}

// The discussion in reading order. Whatever's past the reader arrives as locked stubs (no text at all),
// shown as "🔒 3 comments ahead at 42%" so they know there's more waiting without being spoiled.
const Discussion: FC<DiscussionProps> = ({ buddyReadId, comments, viewerProgress, isHost, canPost, onChange }) => {
  const timeline = buildTimeline(comments)
  // "You are here" sits before the first thing past the reader.
  const hereIndex = timeline.findIndex((t) => (t.kind === "locked" ? t.position : t.comment.position) > viewerProgress)
  const youAreHere = (
    <li aria-label={`You are at ${formatPercent(viewerProgress)}`} className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
      <span className="h-px flex-1 bg-neutral-300 dark:bg-neutral-700" />
      You&apos;re at {formatPercent(viewerProgress)}
      <span className="h-px flex-1 bg-neutral-300 dark:bg-neutral-700" />
    </li>
  )

  return (
    <section aria-labelledby="discussion-heading" className="flex flex-col gap-6">
      <h2 id="discussion-heading" className="text-lg font-semibold">Discussion</h2>

      {canPost && <CommentComposer buddyReadId={buddyReadId} progress={viewerProgress} onPosted={onChange} />}

      {timeline.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-muted-foreground">
          No comments yet. Say how it&apos;s going: nobody sees it until they&apos;ve read that far.
        </p>
      ) : (
        <ol className="flex flex-col gap-6">
          {timeline.map((entry, i) => (
            <Fragment key={entry.kind === "locked" ? `locked-${entry.ids[0]}` : entry.comment.id}>
              {i === hereIndex && youAreHere}
              <li>
                {entry.kind === "locked" ? (
                  <div className="flex items-center gap-3 rounded-xl bg-neutral-100 dark:bg-neutral-900 px-4 py-3 text-sm">
                    <Lock size={16} aria-hidden className="shrink-0 text-muted-foreground" />
                    <span className="flex-1">
                      {entry.count} {entry.count === 1 ? "comment" : "comments"} ahead at <span className="font-semibold tabular-nums">{formatPercent(entry.position)}</span>
                    </span>
                    <span className="flex -space-x-1" aria-hidden>
                      {entry.colours.slice(0, 5).map((c) => (
                        <span key={c} className="h-3 w-3 rounded-full ring-2 ring-neutral-100 dark:ring-neutral-900" style={{ background: c }} />
                      ))}
                    </span>
                  </div>
                ) : (
                  <CommentItem comment={entry.comment} buddyReadId={buddyReadId} viewerProgress={viewerProgress} isHost={isHost} canPost={canPost} onChange={onChange} />
                )}
              </li>
            </Fragment>
          ))}
          {hereIndex === -1 && viewerProgress < 100 && youAreHere}
        </ol>
      )}
    </section>
  )
}

export default Discussion
