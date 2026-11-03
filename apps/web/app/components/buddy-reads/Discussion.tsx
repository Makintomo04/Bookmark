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
  // Where the reader is: everything below it arrives as they read.
  const youAreHere = (
    <li aria-label={`You're at ${formatPercent(viewerProgress)}. Anything past it unlocks as you read.`} className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
      <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      <Lock size={13} aria-hidden className="shrink-0" />
      <span className="text-center">Anything past {formatPercent(viewerProgress)} unlocks as you read</span>
      <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
    </li>
  )

  return (
    <section aria-labelledby="discussion-heading" className="flex flex-col gap-6">
      <h2 id="discussion-heading" className="sr-only">Discussion</h2>

      {timeline.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No comments yet. Say how it&apos;s going: nobody sees it until they&apos;ve read that far.
        </p>
      ) : (
        <ol className="flex flex-col gap-6">
          {timeline.map((entry, i) => (
            <Fragment key={entry.kind === "locked" ? `locked-${entry.ids[0]}` : entry.comment.id}>
              {i === hereIndex && youAreHere}
              <li>
                {entry.kind === "locked" ? (
                  <div className="flex items-center gap-3 px-1 text-sm text-muted-foreground">
                    <Lock size={16} aria-hidden className="shrink-0" />
                    <span className="flex-1">
                      {entry.count} {entry.count === 1 ? "comment" : "comments"} ahead at <span className="font-semibold tabular-nums text-foreground">{formatPercent(entry.position)}</span>
                    </span>
                    <span className="flex -space-x-1" aria-hidden>
                      {entry.colours.slice(0, 5).map((c) => (
                        <span key={c} className="h-3 w-3 rounded-full ring-2 ring-background" style={{ background: c }} />
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

      {/* Chat-style, at the end of the thread: it stays on screen while you read the thread, then settles above
          whatever follows it. On a phone it spans the screen's width with a rule above it. */}
      {canPost && (
        <div className="sticky bottom-0 z-20 -mx-4 border-t border-neutral-200 bg-background px-3 pb-[max(14px,env(safe-area-inset-bottom))] pt-2.5 dark:border-neutral-800 sm:mx-0 sm:border-0 sm:px-0 sm:pb-4">
          <CommentComposer buddyReadId={buddyReadId} progress={viewerProgress} onPosted={onChange} />
        </div>
      )}
    </section>
  )
}

export default Discussion
