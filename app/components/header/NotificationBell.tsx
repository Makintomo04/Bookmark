"use client"
import { FC } from 'react'
import { booksReadOf, tierRingStyle } from '@/lib/readerTier'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import { IoNotificationsOutline } from "react-icons/io5"
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

interface NotificationBellProps {

}

type NotificationLike = { type: string; achievementKey?: string | null; count?: number | null; buddyRead?: { id: string; title: string; inviteCode: string } | null; quest?: { slug: string; title: string } | null; actor: { username: string } }

const notificationCopy = (n: NotificationLike) => {
  const others = (n.count ?? 1) - 1
  const book = n.buddyRead?.title ?? "a book"
  switch (n.type) {
    case "NEW_FOLLOWER": return "started following you"
    case "ACHIEVEMENT_EARNED": return `reached the "${getAchievementTitle(n.achievementKey ?? "")}" milestone`
    case "QUEST_COMPLETED": return `completed the ${n.quest ? `"${n.quest.title}"` : "seasonal"} quest and earned its limited-edition medal`
    case "BUDDY_READ_INVITE": return `invited you to read ${book} together`
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

  const handleOpenChange = (open: boolean) => {
    if (open && unreadCount > 0) {
      axios.patch("/api/notifications", { all: true }).then(() => mutate())
    }
  }

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <div className="relative cursor-pointer p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition">
          <IoNotificationsOutline size={22}/>
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
          <Link key={n.id} href={notificationHref(n)} className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            <div className="h-9 w-9 flex-shrink-0 rounded-full overflow-hidden relative" style={{ background: n.actor.favColour || "#f44336", ...tierRingStyle(booksReadFor(n.actor.username, booksReadOf(n.actor))) }}>
              {n.actor.image && <Image src={n.actor.image} alt="" fill className="object-cover"/>}
            </div>
            <div className="min-w-0">
              {n.type === "COMMENTS_UNLOCKED" ? (
                // Not one person's doing: "3 comments unlocked in Dune".
                <p className="text-sm truncate">🔓 {n.count ?? 1} {n.count === 1 ? "comment" : "comments"} unlocked in <span className="font-semibold">{n.buddyRead?.title ?? "your reading circle"}</span></p>
              ) : (
                <p className="text-sm truncate"><span className="font-semibold">{n.actor.username}</span> {notificationCopy(n)}</p>
              )}
              <p className="text-xs text-muted-foreground">{moment(n.createdAt).fromNow()}</p>
            </div>
          </Link>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default NotificationBell
