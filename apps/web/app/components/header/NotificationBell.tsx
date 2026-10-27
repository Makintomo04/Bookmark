"use client"
import { FC, useEffect, useRef, useState } from 'react'
import { booksReadOf, tierRingStyle } from '@/lib/readerTier'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import { Bell } from "lucide-react"
import Image from 'next/image'
import Link from 'next/link'
import moment from 'moment'
import axios from 'axios'
import { mutate as revalidate } from 'swr'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import useNotifications from '@/app/hooks/useNotifications'
import { getAchievementTitle } from '@/lib/achievements-catalog'
import { notify } from '@/lib/notify'
import { refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { reviewHiddenMessage } from '@/lib/reviewReports'

interface NotificationBellProps {

}

type NotificationLike = { type: string; achievementKey?: string | null; count?: number | null; buddyRead?: { id: string; title: string; inviteCode: string; status?: string } | null; book?: { id: string; title: string; author: string; coverImage: string; onShelf: boolean; href?: string | null } | null; actor: { username: string } }

const notificationCopy = (n: NotificationLike) => {
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
    default: return "did something"
  }
}

const notificationHref = (n: NotificationLike) => {
  if (n.type === "ACHIEVEMENT_EARNED") return "/achievements"
  if (n.type === "REVIEW_HIDDEN" && n.book?.href) return `${n.book.href}#reviews-heading`
  if (n.type === "BUDDY_READ_INVITE" && n.buddyRead) return `/circles/join/${n.buddyRead.inviteCode}`
  if (n.buddyRead) return `/circles/${n.buddyRead.id}`
  return `/u/${encodeURIComponent(n.actor.username)}`
}

// The kinds that also get a toast when they arrive: other people's doing, at a moment the reader can't
// predict. Achievements have their own celebration and unlocked comments follow the reader's own save.
const TOASTED = new Set(["NEW_FOLLOWER", "FOLLOW_REQUEST", "BUDDY_READ_INVITE", "BOOK_RECOMMENDED", "BUDDY_READ_HOSTED", "BUDDY_READ_HOST_INHERITED"])

const toastCopy = (n: NotificationLike) =>
  n.type === "BUDDY_READ_HOST_INHERITED"
    ? `You're now hosting ${n.buddyRead?.title ?? "a reading circle"}`
    : `${n.actor.username} ${notificationCopy(n)}`

const NotificationBell: FC<NotificationBellProps> = ({}) => {
  const { notifications, unreadCount, isLoading, isError, mutate } = useNotifications()
  const booksReadFor = useBooksReadFor()
  const [open, setOpen] = useState(false)
  // Ids already accounted for. Null until the first load, which only records what's there, so a page
  // load never replays old notifications as toasts.
  const seen = useRef<Set<string> | null>(null)
  // Set when a row's link is followed, so closing the menu doesn't hand focus back to the bell: that scrolls
  // the page to the top and undoes a link to part of a page (a hidden review's #reviews-heading).
  const followedLink = useRef(false)

  // Adds a recommended book to Want to read. Its own menu item, beside the row's link rather than inside it.
  const addRecommended = (id: string) => {
    axios.post(`/api/recommendations/${id}`).then(({ data }) => {
      notify.success(data.added ? "Added to Want to read" : "Already on your shelf")
      refreshAfterBookChange()
    }).catch((err) => {
      notify.error((axios.isAxiosError(err) && err.response?.data?.error) || "Couldn't add that book")
    })
  }

  // Answers a follow request from the bell; Settings → Privacy lists them all as well.
  const answerRequest = (username: string, action: "accept" | "decline") => {
    axios.post(`/api/follow-requests/from/${encodeURIComponent(username)}`, { action }).then(({ data }) => {
      if (data.accepted) notify.success(`${username} can now see your profile.`)
    }).catch((err) => {
      notify.error((axios.isAxiosError(err) && err.response?.data?.error) || "Couldn't answer that request. Try again.")
    }).finally(() => {
      mutate()
      // The list on your profile and in Settings.
      revalidate('/api/follow-requests')
    })
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next && unreadCount > 0) {
      axios.patch("/api/notifications", { all: true }).then(() => mutate())
    }
  }

  // The badge alone is easy to miss, so new social notifications also get a toast: one per poll, and none
  // while the dropdown is open, where they're already on screen. View opens the bell, where their actions are.
  useEffect(() => {
    if (isLoading || isError) return
    if (seen.current === null) {
      seen.current = new Set(notifications.map((n: any) => n.id))
      return
    }
    const known = seen.current
    const arrived = notifications.filter((n: any) => !known.has(n.id) && !n.read && TOASTED.has(n.type))
    notifications.forEach((n: any) => known.add(n.id))
    if (open || arrived.length === 0) return
    notify.info(arrived.length === 1 ? toastCopy(arrived[0]) : `${arrived.length} new notifications`, {
      action: { label: "View", onClick: () => handleOpenChange(true) },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, isLoading, isError])

  const actionClass = "h-8 px-3 rounded-full text-xs font-medium cursor-pointer focus:bg-accent"

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          className="relative grid size-10 place-items-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell size={20} aria-hidden />
          {/* The ring in the page colour keeps the badge from running into the bell's outline. */}
          {unreadCount > 0 && (
            <span aria-hidden className="absolute -top-0.5 -right-1 h-[18px] min-w-[18px] px-[5px] rounded-full bg-brand-fill text-white text-[10px] leading-none tabular-nums flex items-center justify-center font-bold ring-2 ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 max-h-96 overflow-y-auto"
        onCloseAutoFocus={(e) => {
          if (!followedLink.current) return
          followedLink.current = false
          e.preventDefault()
        }}
      >
        {notifications.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No notifications yet.</p>
        )}
        {notifications.map((n: any) => (
          <div key={n.id} className="flex flex-col">
            <DropdownMenuItem asChild className="items-center gap-3 p-2 rounded-md cursor-pointer">
              <Link href={notificationHref(n)} onClick={() => { followedLink.current = true }}>
                <div className="h-9 w-9 flex-shrink-0 rounded-full overflow-hidden relative" style={{ background: n.actor.favColour || "#D92D2D", ...tierRingStyle(booksReadFor(n.actor.username, booksReadOf(n.actor))) }}>
                  {n.actor.image && <Image src={n.actor.image} alt="" fill sizes="36px" className="object-cover"/>}
                </div>
                <div className="min-w-0">
                  {n.type === "COMMENTS_UNLOCKED" ? (
                    // Not one person's doing: "3 comments unlocked in Dune".
                    <p className="text-sm truncate">{n.count ?? 1} {n.count === 1 ? "comment" : "comments"} unlocked in <span className="font-semibold">{n.buddyRead?.title ?? "your reading circle"}</span></p>
                  ) : n.type === "REVIEW_HIDDEN" ? (
                    // Moderation, so nobody is named: not the reporter, not the librarian.
                    // Never cut short: the last line is how to appeal.
                    <p className="text-sm">{reviewHiddenMessage(n.book?.title ?? null)}</p>
                  ) : n.type === "BUDDY_READ_HOST_INHERITED" ? (
                    // The old host closed their account, so there's nobody to name.
                    <p className="text-sm line-clamp-2">
                      {n.buddyRead?.status === "ARCHIVED"
                        ? <>The host of <span className="font-semibold">{n.buddyRead?.title ?? "a reading circle"}</span> closed their account. It&apos;s yours now, archived until you have room to reopen it.</>
                        : <>You&apos;re now hosting <span className="font-semibold">{n.buddyRead?.title ?? "a reading circle"}</span>: its host closed their account.</>}
                    </p>
                  ) : (
                    <p className="text-sm truncate"><span className="font-semibold">{n.actor.username}</span> {notificationCopy(n)}</p>
                  )}
                  {n.type === "BOOK_RECOMMENDED" && n.message && (
                    <p className="text-xs text-muted-foreground line-clamp-2 italic">&ldquo;{n.message}&rdquo;</p>
                  )}
                  <p className="text-xs text-muted-foreground">{moment(n.createdAt).fromNow()}</p>
                  {n.type === "BOOK_RECOMMENDED" && n.book?.onShelf && (
                    <p className="mt-1 text-xs text-muted-foreground">On your shelf</p>
                  )}
                </div>
              </Link>
            </DropdownMenuItem>
            {/* Actions are menu items of their own, so arrow keys reach them and no button sits inside a link. */}
            {n.type === "BOOK_RECOMMENDED" && n.book && !n.book.onShelf && (
              <div className="flex gap-2 pl-14 pb-2">
                <DropdownMenuItem onSelect={() => addRecommended(n.id)} className={`${actionClass} underline underline-offset-2`}>
                  Add to Want to read
                </DropdownMenuItem>
              </div>
            )}
            {n.type === "FOLLOW_REQUEST" && (
              <div className="flex gap-2 pl-14 pb-2">
                <DropdownMenuItem onSelect={() => answerRequest(n.actor.username, "accept")} className={`${actionClass} bg-foreground text-background focus:bg-foreground focus:text-background focus:opacity-90`} aria-label={`Accept ${n.actor.username}'s request`}>
                  Accept
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => answerRequest(n.actor.username, "decline")} className={`${actionClass} border border-border`} aria-label={`Decline ${n.actor.username}'s request`}>
                  Decline
                </DropdownMenuItem>
              </div>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default NotificationBell
