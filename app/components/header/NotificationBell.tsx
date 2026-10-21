"use client"
import { FC } from 'react'
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

const notificationCopy = (n: { type: string; achievementKey?: string | null }) => {
  switch (n.type) {
    case "NEW_FOLLOWER": return "started following you"
    case "ACHIEVEMENT_EARNED": return `earned the "${getAchievementTitle(n.achievementKey ?? "")}" badge`
    default: return "did something"
  }
}

const NotificationBell: FC<NotificationBellProps> = ({}) => {
  const { notifications, unreadCount, mutate } = useNotifications()

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
          <Link key={n.id} href={`/u/${n.actor.username}`} className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            <div className="h-9 w-9 flex-shrink-0 rounded-full overflow-hidden relative" style={{ background: n.actor.favColour || "#f44336" }}>
              {n.actor.image && <Image src={n.actor.image} alt="" fill className="object-cover"/>}
            </div>
            <div className="min-w-0">
              <p className="text-sm truncate"><span className="font-semibold">{n.actor.username}</span> {notificationCopy(n)}</p>
              <p className="text-xs text-muted-foreground">{moment(n.createdAt).fromNow()}</p>
            </div>
          </Link>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default NotificationBell
