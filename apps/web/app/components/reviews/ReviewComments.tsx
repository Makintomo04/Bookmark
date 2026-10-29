"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import moment from 'moment'
import { MoreHorizontal } from 'lucide-react'
import { notify, apiError } from '@/lib/notify'
import { readerName } from '@/lib/profile'
import { REVIEW_COMMENT_MAX, REVIEW_COMMENT_REPORT_REASONS, type SerializedReviewComment } from '@bookmark/shared/reviewComments'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'
import MemberAvatar from '../buddy-reads/MemberAvatar'
import StaffSeal from '../profile-head/StaffSeal'

interface ReviewCommentsProps {
  bookId: string
  comments: SerializedReviewComment[]
  // Signed in and allowed by the reviewer's setting. The server checks again on every post.
  canComment: boolean
  // Why the composer isn't there, when it isn't.
  closedReason: string | null
  // The reviewer's own page: they can delete anyone's comment.
  isReviewer: boolean
}

const textareaClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"

const Composer: FC<{ bookId: string; parentId?: string; onDone: () => void; onCancel?: () => void }> = ({ bookId, parentId, onDone, onCancel }) => {
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const id = parentId ? `reply-${parentId}` : "new-review-comment"

  const submit = () => {
    if (!body.trim() || busy) return
    setBusy(true)
    axios.post(`/api/reviews/${bookId}/comments`, { body, parentId })
      .then(() => { setBody(""); onDone() })
      .catch((err) => notify.error(apiError(err, "Couldn't post that. Check your connection and try again.")))
      .finally(() => setBusy(false))
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">{parentId ? "Your reply" : "Your comment"}</label>
      <textarea
        id={id}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }}
        maxLength={REVIEW_COMMENT_MAX}
        rows={parentId ? 2 : 3}
        autoFocus={!!parentId}
        placeholder={parentId ? "Reply…" : "Add a comment…"}
        disabled={busy}
        className={textareaClass}
      />
      <div className="flex justify-end gap-2">
        {onCancel && <button type="button" onClick={onCancel} disabled={busy} className={secondaryButtonClass}>Cancel</button>}
        <button type="submit" disabled={busy || !body.trim()} className={primaryButtonClass}>{busy ? "Posting…" : parentId ? "Reply" : "Post"}</button>
      </div>
    </form>
  )
}

const Comment: FC<{ comment: SerializedReviewComment; bookId: string; canComment: boolean; isReviewer: boolean; isReply?: boolean; onChange: () => void }> = ({ comment, bookId, canComment, isReviewer, isReply = false, onChange }) => {
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body ?? "")
  const [busy, setBusy] = useState(false)
  const base = `/api/reviews/${bookId}/comments/${comment.id}`
  const author = comment.author
  const canModerate = comment.mine || isReviewer

  const saveEdit = () => {
    if (!draft.trim()) return
    setBusy(true)
    axios.patch(base, { body: draft }).then(() => { setEditing(false); onChange() })
      .catch((err) => notify.error(apiError(err, "Couldn't save your edit.")))
      .finally(() => setBusy(false))
  }
  const remove = () => {
    if (!window.confirm(comment.mine ? "Delete your comment?" : "Delete this comment for everyone?")) return
    axios.delete(base).then(onChange).catch((err) => notify.error(apiError(err, "Couldn't delete that comment.")))
  }
  const report = (reason: string) => {
    axios.post(`${base}/report`, { reason })
      .then(() => notify.success("Thanks. We'll take a look."))
      .catch((err) => notify.error(apiError(err, "Couldn't send the report.")))
  }

  const replies = comment.replies.map((r) => (
    <Comment key={r.id} comment={r} bookId={bookId} canComment={canComment} isReviewer={isReviewer} isReply onChange={onChange} />
  ))

  if (comment.deleted) {
    return (
      <article className="flex flex-col gap-3">
        <p className="text-sm italic text-muted-foreground">This comment was deleted.</p>
        {replies.length > 0 && <div className="flex flex-col gap-4 border-l pl-4">{replies}</div>}
      </article>
    )
  }

  return (
    <article id={`comment-${comment.id}`} className="flex gap-3">
      {author?.username ? (
        <Link href={`/u/${author.username}`} className="shrink-0 self-start rounded-[30%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <MemberAvatar username={author.username} image={author.image} favColour={author.favColour} size={isReply ? 28 : 36} />
        </Link>
      ) : (
        <MemberAvatar username={null} image={null} favColour={null} size={isReply ? 28 : 36} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-sm leading-snug">
            {author?.username
              ? <Link href={`/u/${author.username}`} className="font-semibold hover:underline underline-offset-4">{comment.mine ? "You" : readerName(author)}</Link>
              : <span className="font-semibold text-muted-foreground">Former reader</span>}
            {author?.staffBadge && <StaffSeal kind={author.staffBadge} name={comment.mine ? null : readerName(author)} size={18} className="ml-1 align-[-4px]" />}
            <span className="text-muted-foreground"> · {moment(comment.createdAt).fromNow()}{comment.editedAt ? " · edited" : ""}</span>
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Comment options" className="-mr-1 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <MoreHorizontal size={16} aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {comment.mine && <DropdownMenuItem onSelect={() => { setDraft(comment.body ?? ""); setEditing(true) }}>Edit</DropdownMenuItem>}
              {canModerate && <DropdownMenuItem onSelect={remove} className="text-danger">Delete</DropdownMenuItem>}
              {!comment.mine && (
                <>
                  {canModerate && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Report</DropdownMenuLabel>
                  {REVIEW_COMMENT_REPORT_REASONS.map((reason) => (
                    <DropdownMenuItem key={reason} onSelect={() => report(reason)}>{reason}</DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {editing ? (
          <div className="mt-2 flex flex-col gap-2">
            <label htmlFor={`edit-${comment.id}`} className="sr-only">Edit your comment</label>
            <textarea id={`edit-${comment.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={REVIEW_COMMENT_MAX} rows={3} autoFocus disabled={busy} className={textareaClass} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} disabled={busy} className={secondaryButtonClass}>Cancel</button>
              <button type="button" onClick={saveEdit} disabled={busy || !draft.trim()} className={primaryButtonClass}>Save</button>
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{comment.body}</p>
        )}

        {!isReply && canComment && !replying && !editing && (
          <button type="button" onClick={() => setReplying(true)} className="mt-1.5 text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">Reply</button>
        )}
        {replies.length > 0 && <div className="mt-4 flex flex-col gap-4 border-l pl-4">{replies}</div>}
        {replying && (
          <div className="mt-3">
            <Composer bookId={bookId} parentId={comment.id} onDone={() => { setReplying(false); onChange() }} onCancel={() => setReplying(false)} />
          </div>
        )}
      </div>
    </article>
  )
}

// The thread under a review. The page is a server component, so changes refresh it rather than keeping a
// second copy of the comments here.
const ReviewComments: FC<ReviewCommentsProps> = ({ bookId, comments, canComment, closedReason, isReviewer }) => {
  const router = useRouter()
  const refresh = () => router.refresh()
  return (
    <section id="comments" aria-labelledby="comments-heading" className="scroll-mt-24">
      <h2 id="comments-heading" className="text-lg font-semibold">
        Comments<span className="ml-2 text-base font-normal text-muted-foreground tabular-nums">{comments.reduce((n, c) => n + (c.deleted ? 0 : 1) + c.replies.filter((r) => !r.deleted).length, 0)}</span>
      </h2>
      <div className="mt-4">
        {canComment
          ? <Composer bookId={bookId} onDone={refresh} />
          : closedReason && <p className="text-sm text-muted-foreground">{closedReason}</p>}
      </div>
      {comments.length > 0 && (
        <div className="mt-6 flex flex-col gap-6">
          {comments.map((c) => <Comment key={c.id} comment={c} bookId={bookId} canComment={canComment} isReviewer={isReviewer} onChange={refresh} />)}
        </div>
      )}
    </section>
  )
}

export default ReviewComments
