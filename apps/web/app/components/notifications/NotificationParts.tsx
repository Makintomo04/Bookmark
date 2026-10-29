"use client"
import { FC } from 'react'
import ReaderName from '@/app/components/profile/ReaderName'
import moment from 'moment'
import axios from 'axios'
import { mutate as revalidate } from 'swr'
import { getAchievementTitle } from '@/lib/achievements-catalog'
import { notify } from '@/lib/notify'
import { refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { reviewHiddenMessage } from '@/lib/reviewReports'
import { seriesNewsText } from '@/lib/series'
import { escalationCopy, escalationResolvedText, reviewRestoredText, roleChangedText, staffNoticeWebPath, staffReportText } from '@bookmark/shared/staffNotices'
import type { StaffBadgeKind } from '@/lib/staffBadge'
import BookCover from '../cards/BookCover'
import { ActorAvatar } from '../feed/FeedRow'
import StaffSeal from '../profile-head/StaffSeal'

// One notification as /api/notifications sends it, shared by the bell's menu and the feed page's
// Notifications tab. The avatar is the feed's ActorAvatar (NotificationLead).

export type NotificationLike = {
  id?: string
  type: string
  createdAt?: string
  read?: boolean
  message?: string | null
  achievementKey?: string | null
  count?: number | null
  buddyRead?: { id: string; title: string; inviteCode: string; status?: string } | null
  book?: { id: string; title: string; author: string; coverImage: string; onShelf: boolean; href?: string | null } | null
  // NEW_IN_SERIES: the new book.
  work?: { title: string; coverUrl: string | null; seriesName: string | null; seriesPosition: number | null; href: string | null } | null
  actor: { username: string; displayName?: string | null; image?: string | null; favColour?: string | null; staffBadge?: StaffBadgeKind | null }
}

export const notificationCopy = (n: NotificationLike) => {
  const others = (n.count ?? 1) - 1
  const book = n.buddyRead?.title ?? "a book"
  switch (n.type) {
    case "NEW_FOLLOWER": return "started following you"
    case "ACHIEVEMENT_EARNED": return `reached the "${getAchievementTitle(n.achievementKey ?? "")}" milestone`
    case "BUDDY_READ_INVITE": return `invited you to read ${book} together`
    case "BOOK_RECOMMENDED": return `thinks you'd like ${n.book?.title ?? "a book"}`
    case "BUDDY_READ_JOINED": return `${others > 0 ? `and ${others} ${others === 1 ? "other" : "others"} ` : ""}joined your reading circle for ${book}`
    case "BUDDY_READ_HOSTED": return `handed you the reading circle for ${book}. You're the host now`
    case "FOLLOW_REQUEST": return "asked to follow you"
    case "STAFF_ESCALATION": return escalationCopy(n.message)
    default: return "did something"
  }
}

export const notificationHref = (n: NotificationLike) => {
  if (n.type === "ACHIEVEMENT_EARNED") return "/achievements"
  if ((n.type === "REVIEW_HIDDEN" || n.type === "REVIEW_RESTORED") && n.book?.href) return `${n.book.href}#reviews-heading`
  // The staff queue, or the staff console for a new role. A review back up with no page to show it on,
  // or a reader again, stays here.
  const staffPath = staffNoticeWebPath(n.type, n.message)
  if (staffPath) return staffPath
  if (n.type === "REVIEW_RESTORED" || n.type === "ROLE_CHANGED") return "/notifications"
  if (n.type === "NEW_IN_SERIES") return n.work?.href ?? "/notifications"
  // The book, not the sender: they're named in the line, and the book is what's being offered.
  if (n.type === "BOOK_RECOMMENDED" && n.book?.href) return n.book.href
  if (n.type === "BUDDY_READ_INVITE" && n.buddyRead) return `/circles/join/${n.buddyRead.inviteCode}`
  if (n.buddyRead) return `/circles/${n.buddyRead.id}`
  return `/u/${encodeURIComponent(n.actor.username)}`
}

// Beside the words: the new book's cover for a new book in a series (nobody did it), else whoever it's
// from. `size` as ActorAvatar's.
export const NotificationLead: FC<{ n: NotificationLike; size?: "sm" | "md" }> = ({ n, size = "md" }) => n.type === "NEW_IN_SERIES" ? (
  <BookCover book={{ title: n.work?.title ?? "", author: "", coverImage: n.work?.coverUrl ?? "", cardColour: null }}
    variant="thumb" sizes={size === "sm" ? "36px" : "40px"} className={size === "sm" ? "w-9 shrink-0 rounded-sm" : "w-10 shrink-0 rounded-sm"} />
) : <ActorAvatar actor={n.actor} size={size} />

// What happened and when. The line itself always wraps: cut short, it loses the book it's about. `full`
// (the page) also lets a sender's note run on, which the menu keeps to two lines.
export const NotificationText: FC<{ n: NotificationLike; full?: boolean }> = ({ n, full = false }) => {
  return (
    <div className="min-w-0">
      {n.type === "COMMENTS_UNLOCKED" ? (
        // Not one person's doing: "3 comments to read in Dune", reached or newly posted.
        <p className="text-sm">{n.count ?? 1} {n.count === 1 ? "comment" : "comments"} to read in <span className="font-semibold">{n.buddyRead?.title ?? "your reading circle"}</span></p>
      ) : n.type === "NEW_IN_SERIES" ? (
        <p className={`text-sm ${full ? "" : "line-clamp-2"}`}>
          {seriesNewsText({ title: n.work?.title ?? null, seriesName: n.work?.seriesName ?? null, position: n.work?.seriesPosition ?? null, count: n.count ?? null })}
        </p>
      ) : n.type === "STAFF_REPORT" ? (
        <p className="text-sm">{staffReportText(n.count)}</p>
      ) : n.type === "ESCALATION_RESOLVED" ? (
        // Staff to staff, but the bell's other notices name nobody either.
        <p className={`text-sm ${full ? "" : "line-clamp-2"}`}>{escalationResolvedText(n.message)}</p>
      ) : n.type === "REVIEW_RESTORED" ? (
        // Moderation, so nobody is named, as when it was hidden. message is the title as it was.
        <p className={`text-sm ${full ? "" : "line-clamp-2"}`}>{reviewRestoredText(n.book?.title ?? n.message)}</p>
      ) : n.type === "ROLE_CHANGED" ? (
        // Nobody named: the role is the team's to give.
        <p className={`text-sm ${full ? "" : "line-clamp-3"}`}>{roleChangedText(n.message)}</p>
      ) : n.type === "REVIEW_HIDDEN" ? (
        // Moderation, so nobody is named: not the reporter, not the librarian.
        // Never cut short: the last line is how to appeal.
        <p className="text-sm">{reviewHiddenMessage(n.book?.title ?? null)}</p>
      ) : n.type === "BUDDY_READ_HOST_INHERITED" ? (
        // The old host closed their account, so there's nobody to name.
        <p className={`text-sm ${full ? "" : "line-clamp-2"}`}>
          {n.buddyRead?.status === "ARCHIVED"
            ? <>The host of <span className="font-semibold">{n.buddyRead?.title ?? "a reading circle"}</span> closed their account. It&apos;s yours now, archived until you have room to reopen it.</>
            : <>You&apos;re now hosting <span className="font-semibold">{n.buddyRead?.title ?? "a reading circle"}</span>: its host closed their account.</>}
        </p>
      ) : n.type === "BOOK_RECOMMENDED" && n.book ? (
        // The book gets its own line with its cover and author, so it's plain which one is being added.
        <>
          <p className="text-sm">
            <ReaderName reader={n.actor} className="font-semibold" badge={n.actor.staffBadge && <StaffSeal kind={n.actor.staffBadge} size={18} pressable={false} className="ml-1 align-[-4px]" />} />
            {" "}thinks you&apos;d like
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <BookCover book={{ title: n.book.title, author: n.book.author, coverImage: n.book.coverImage, cardColour: null }}
              variant="thumb" sizes="28px" className="w-7 shrink-0 rounded-sm" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug">{n.book.title}</p>
              {n.book.author && <p className="text-xs text-muted-foreground">{n.book.author}</p>}
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm">
          {/* The row is a link, so the seal only marks the role here; the profile's seal explains it. */}
          <ReaderName reader={n.actor} className="font-semibold" badge={n.actor.staffBadge && <StaffSeal kind={n.actor.staffBadge} size={18} pressable={false} className="ml-1 align-[-4px]" />} />
          {" "}{notificationCopy(n)}
        </p>
      )}
      {n.type === "BOOK_RECOMMENDED" && n.message && (
        <p className={`mt-1 text-xs text-muted-foreground italic ${full ? "" : "line-clamp-2"}`}>&ldquo;{n.message}&rdquo;</p>
      )}
      <p className="text-xs text-muted-foreground">{moment(n.createdAt).fromNow()}</p>
      {n.type === "BOOK_RECOMMENDED" && n.book?.onShelf && (
        <p className="mt-1 text-xs text-muted-foreground">On your shelf</p>
      )}
    </div>
  )
}

// The actions a notification can carry: add a recommended book, answer a follow request. `refresh`
// reloads the notifications afterwards.
export function useNotificationActions(refresh: () => void) {
  const addRecommended = (id: string) => {
    axios.post(`/api/recommendations/${id}`).then(({ data }) => {
      notify.success(data.added ? "Added to Want to read" : "Already on your shelf")
      refreshAfterBookChange()
    }).catch((err) => {
      notify.error((axios.isAxiosError(err) && err.response?.data?.error) || "Couldn't add that book")
    })
  }

  // Settings → Privacy lists every request as well.
  const answerRequest = (username: string, action: "accept" | "decline") => {
    axios.post(`/api/follow-requests/from/${encodeURIComponent(username)}`, { action }).then(({ data }) => {
      if (data.accepted) notify.success(`${username} can now see your profile.`)
    }).catch((err) => {
      notify.error((axios.isAxiosError(err) && err.response?.data?.error) || "Couldn't answer that request. Try again.")
    }).finally(() => {
      refresh()
      // The list on your profile and in Settings.
      revalidate('/api/follow-requests')
    })
  }

  return { addRecommended, answerRequest }
}
