"use client"
import { FC } from 'react'
import { Button } from '../ui/button'
import useEditProfileModal from '@/app/hooks/useEditProfileModal'

// Settings points to Edit profile rather than repeating it: how others see you lives there.
const ProfileShortcut: FC = () => {
  const { onOpen } = useEditProfileModal()
  return (
    <div className="rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium">Profile</p>
        <p className="text-xs text-muted-foreground">Your photo, banner, username, bio, colour and Plus styling.</p>
      </div>
      <Button type="button" variant="outline" onClick={onOpen} className="shrink-0">Edit profile</Button>
    </div>
  )
}

export default ProfileShortcut
