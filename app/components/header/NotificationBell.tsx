"use client"
import { FC } from 'react'
import { booksReadOf, tierRingStyle } from '@/lib/readerTier'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import { Bell } from "lucide-react"
import Image from 'next/image'
import Link from 'next/link'
import moment from 'moment'
import axios from 'axios'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import useNotifications from '@/app/hooks/useNotifications'
import { getAchievementTitle } from '@/lib/achievements-catalog'
import { notify } from '@/lib/notify'
import { refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'

interface NotificationBellProps {

}

type NotificationLike = { type: string; achievementKey?: string | null; count?: number | null; buddyRead?: { id: string; title: string; inviteCode: string } | null; quest?: { slug: string; title: string } | null; book?: { id: string; title: string; author: string; coverImage: string; onShelf: boolean } | null; actor: { username: string } }

const notificationCopy = (n: NotificationLike) => {
  const others = (n.count ?? 1) - 1
  const book = n.buddyRead?.title ?? "a book"
  switch (n.type) {
    case "NEW_FOLLOWER": return "started following you"
    case "ACHIEVEMENT_EARNED": return `reached the "${getAchievementTitle(n.achievementKey ?? "")}" milestone`
    case "QUEST_COMPLETED": return `completed the ${n.quest ? `"${n.quest.title}"` : "seasonal"} quest and earned its limited-edition medal`
    case "BUDDY_READ_INVITE": return `invited you to read ${book} together`
    case "BOOK_RECOMMENDED": return `thinks you'd like ${n.book?.title ?? "a book"}`
    case "BUDDY_READ_JOINED": return `${others > 0 ? `and ${others} ${others === 1 ? "other" : "others"} ` : ""}joined your reading circle for ${book}`
    default: return "did something"
  }
}

const notificationHref = (n: NotificationLike) => {
  if (n.type === "ACHIEVEMENT_EARNED") return "/achievements"
  if (n.type === "QUEST_COMPLETED") return n.quest ? `/quests/${n.quest.slug}` : "/achievements"
  if (n.type === "BUDDY_READ_INVITE" && n.buddyRead) return `/circles/join/${n.buddyRead.inviteCode}`
  if (n.buddyRead) return `/circles/${n.buddyRead.id}`
  return `/u/${n.actor.username}`
}

const NotificationBell: FC<NotificationBellProps> = ({}) => {
  const { notifications, unreadCount, mutate } = useNotifications()
  const booksReadFor = useBooksReadFor()

  // Adds a recommended book to Want to read, without following the row's link.
  const addRecommended = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    axios.post(`/api/recommendations/${id}`).then(({ data }) => {
      notify.success(data.added ? "Added to Want to read" : "Already on your shelf")
      refreshAfterBookChange()
    }).catch((err) => {
      notify.error((axios.isAxiosError(err) && err.response?.data?.error) || "Couldn't add that book")
    })
  }

  const handleOpenChange = (open: boolean) => {
    if (open && unreadCount > 0) {
      axios.patch("/api/notifications", { all: true }).then(() => mutate())
    }
  }

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <div className="relative cursor-pointer p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition">
          <Bell size={20} aria-hidden />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 h-4 w-4 rounded-full bg-brand-fill text-white text-[10px] flex items-center justify-center font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        {notifications.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No notifications yet.</p>
        )}
        {notifications.map((n: any) => (
          <Link key={n.id} href={notificationHref(n)} className="flex items-center gap-3 p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition">
            <div className="h-9 w-9 flex-shrink-0 rounded-full overflow-hidden relative" style={{ background: n.actor.favColour || "#D92D2D", ...tierRingStyle(booksReadFor(n.actor.username, booksReadOf(n.actor))) }}>
              {n.actor.image && <Image src={n.actor.image} alt="" fill className="object-cover"/>}
            </div>
            <div className="min-w-0">
              {n.type === "COMMENTS_UNLOCKED" ? (
                // Not one person's doing: "3 comments unlocked in Dune".
                <p className="text-sm truncate">🔓 {n.count ?? 1} {n.count === 1 ? "comment" : "comments"} unlocked in <span className="font-semibold">{n.buddyRead?.title ?? "your reading circle"}</span></p>
              ) : (
                <p className="text-sm truncate"><span className="font-semibold">{n.actor.username}</span> {notificationCopy(n)}</p>
              )}
              {n.type === "BOOK_RECOMMENDED" && n.message && (
                <p className="text-xs text-muted-foreground line-clamp-2 italic">&ldquo;{n.message}&rdquo;</p>
              )}
              <p className="text-xs text-muted-foreground">{moment(n.createdAt).fromNow()}</p>
              {n.type === "BOOK_RECOMMENDED" && n.book && (
                n.book.onShelf
                  ? <p className="mt-1 text-xs text-muted-foreground">On your shelf</p>
                  : <button type="button" onClick={(e) => addRecommended(e, n.id)} className="mt-1 text-xs font-medium underline underline-offset-2">Add to Want to read</button>
              )}
            </div>
          </Link>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default NotificationBell
