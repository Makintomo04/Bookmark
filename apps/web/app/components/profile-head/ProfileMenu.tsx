"use client"
import { FC, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'
import { Ban, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { secondaryButtonClass } from './ProfileHeader'

interface ProfileMenuProps {
  username: string
  isBlocked: boolean
}

// The "…" menu on someone else's profile. Blocking asks first, since it also removes follows.
const ProfileMenu: FC<ProfileMenuProps> = ({ username, isBlocked }) => {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const toggleBlock = () => {
    if (!isBlocked && !window.confirm(
      `Block ${username}? They won't be able to follow you or see your profile, reviews or activity, and you'll stop following each other.`
    )) return

    setIsLoading(true)
    const url = `/api/users/${encodeURIComponent(username)}/block`
    const request = isBlocked ? axios.delete(url) : axios.post(url)
    request
      .then(() => {
        notify.success(isBlocked ? `Unblocked ${username}` : `Blocked ${username}`)
        // The server page re-renders with the new relationship.
        router.refresh()
      })
      .catch((err) => {
        notify.error(apiError(err, isBlocked ? `Couldn't unblock ${username}. Try again.` : `Couldn't block ${username}. Try again.`))
      })
      .finally(() => setIsLoading(false))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="More options" disabled={isLoading} className={cn(secondaryButtonClass, "px-2.5")}>
          <MoreHorizontal size={16} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={toggleBlock} className={cn("gap-2", !isBlocked && "text-danger")}>
          <Ban size={14} aria-hidden />
          {isBlocked ? `Unblock ${username}` : `Block ${username}`}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ProfileMenu
