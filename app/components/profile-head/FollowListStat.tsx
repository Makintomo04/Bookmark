"use client"
import { FC, ReactNode } from 'react'
import type { FollowListKind } from '@/lib/follows'
import useFollowListModal from '@/app/hooks/useFollowListModal'

interface FollowListStatProps {
  username: string
  kind: FollowListKind
  className?: string
  children: ReactNode
}

// A follower/following count that opens the list. The only interactive part of a server-rendered header's stats.
const FollowListStat: FC<FollowListStatProps> = ({ username, kind, className, children }) => {
  const followListModal = useFollowListModal()
  return (
    <button type="button" onClick={() => followListModal.onOpen(username, kind)} className={className}>
      {children}
    </button>
  )
}

export default FollowListStat
