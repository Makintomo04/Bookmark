"use client"
import { FC, useEffect, useRef, useState } from 'react'
import { readerName } from '@/lib/profile'
import { Bell } from "lucide-react"
import Link from 'next/link'
import axios from 'axios'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import useNotifications from '@/app/hooks/useNotifications'
import { notify } from '@/lib/notify'
import {
  NotificationLead, NotificationText, notificationCopy, notificationHref, useNotificationActions, type NotificationLike,
} from '../notifications/NotificationParts'
import { feedTabHref } from '@/lib/feedTabs'

interface NotificationBellProps {

}

// The kinds that also get a toast when they arrive: other people's doing, at a moment the reader can't
// predict. Achievements have their own celebration and unlocked comments follow the reader's own save.
const TOASTED = new Set(["NEW_FOLLOWER", "FOLLOW_REQUEST", "BUDDY_READ_INVITE", "BOOK_RECOMMENDED", "BUDDY_READ_HOSTED", "BUDDY_READ_HOST_INHERITED", "CLUB_CIRCLE_ADDED"])

const toastCopy = (n: NotificationLike) =>
  n.type === "BUDDY_READ_HOST_INHERITED"
    ? `You're now hosting ${n.buddyRead?.title ?? "a reading circle"}`
    : `${readerName(n.actor)} ${notificationCopy(n)}`

const NotificationBell: FC<NotificationBellProps> = ({}) => {
  const { notifications, unreadCount, isLoading, isError, mutate } = useNotifications()
  const [open, setOpen] = useState(false)
  // Ids already accounted for. Null until the first load, which only records what's there, so a page
  // load never replays old notifications as toasts.
  const seen = useRef<Set<string> | null>(null)
  // Set when a row's link is followed, so closing the menu doesn't hand focus back to the bell: that scrolls
  // the page to the top and undoes a link to part of a page (a hidden review's #reviews-heading).
  const followedLink = useRef(false)
  const { addRecommended, answerRequest } = useNotificationActions(() => mutate())

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
            <span aria-hidden className="absolute top-0 right-0 h-[18px] min-w-[18px] px-[5px] rounded-full bg-brand-fill text-white text-[10px] leading-none tabular-nums flex items-center justify-center font-bold ring-2 ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 max-h-96 overflow-y-auto pb-0"
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
            <DropdownMenuItem asChild className="items-start gap-3 p-2 rounded-md cursor-pointer">
              <Link href={notificationHref(n)} onClick={() => { followedLink.current = true }}>
                <NotificationLead n={n} size="sm" />
                <NotificationText n={n} />
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
                <DropdownMenuItem onSelect={() => answerRequest(n.actor.username, "accept")} className={`${actionClass} bg-foreground text-background focus:bg-foreground focus:text-background focus:opacity-90`} aria-label={`Accept ${readerName(n.actor)}'s request`}>
                  Accept
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => answerRequest(n.actor.username, "decline")} className={`${actionClass} border border-border`} aria-label={`Decline ${readerName(n.actor)}'s request`}>
                  Decline
                </DropdownMenuItem>
              </div>
            )}
          </div>
        ))}
        {/* Pinned to the foot of the menu however far it's scrolled: every notification, on the feed page's tab. */}
        <div className="sticky bottom-0 -mx-1 mt-1 border-t border-border bg-popover p-1">
          <DropdownMenuItem asChild className="justify-center rounded-md py-2 text-sm font-medium cursor-pointer">
            <Link href={feedTabHref("notifications")} onClick={() => { followedLink.current = true }}>See all notifications</Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default NotificationBell
