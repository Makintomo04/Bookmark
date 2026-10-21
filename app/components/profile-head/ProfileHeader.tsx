"use client"
import { FC, ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import TierAvatar from './TierAvatar'

export interface ProfileStat {
  value: number
  label: string
  href?: string
  onClick?: () => void
}

interface ProfileHeaderProps {
  username: string
  bio?: string | null
  image?: string | null
  banner?: string | null
  colour?: string | null
  stats: ProfileStat[]
  actions?: ReactNode
  children?: ReactNode
  onAvatarClick?: () => void
  booksRead: number
}

export const primaryButtonClass = "inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
export const secondaryButtonClass = "inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"

const Stat: FC<{ stat: ProfileStat }> = ({ stat }) => {
  const content = (
    <>
      <span className="font-semibold text-foreground tabular-nums">{stat.value}</span> {stat.label}
    </>
  )
  const className = "text-sm text-muted-foreground whitespace-nowrap"
  if (stat.href) return <Link href={stat.href} className={cn(className, "hover:text-foreground transition")}>{content}</Link>
  if (stat.onClick) return <button type="button" onClick={stat.onClick} className={cn(className, "hover:text-foreground transition")}>{content}</button>
  return <span className={className}>{content}</span>
}

const ProfileHeader: FC<ProfileHeaderProps> = ({ username, bio, image, banner, colour, stats, actions, children, onAvatarClick, booksRead }) => {
  const accent = colour || "#F13C3C"
  const avatar = (
    <TierAvatar image={image} colour={accent} alt={`${username}'s avatar`} booksRead={booksRead} className="w-24 sm:w-28" />
  )

  return (
    <header>
      <div className={cn("relative overflow-hidden rounded-2xl", banner ? "h-32 sm:h-44" : "h-20 sm:h-28")} style={{ background: accent }}>
        {banner && <Image src={banner} alt="" fill priority sizes="(min-width: 1280px) 1200px, 100vw" className="object-cover" />}
      </div>

      <div className="px-4 sm:px-8">
        <div className="-mt-12 sm:-mt-14 flex items-end justify-between gap-4">
          {onAvatarClick ? (
            <button type="button" onClick={onAvatarClick} aria-label="View profile picture" className="block rounded-[32px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400">
              {avatar}
            </button>
          ) : avatar}
          {actions && <div className="hidden sm:flex items-center gap-2 pb-1">{actions}</div>}
        </div>

        <div className="mt-4">
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight break-words">{username}</h1>
          {bio && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{bio}</p>}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {stats.map((stat) => <Stat key={stat.label} stat={stat} />)}
          </div>
        </div>

        {actions && <div className="mt-5 flex sm:hidden items-center gap-2">{actions}</div>}
        {children}
      </div>
    </header>
  )
}

export default ProfileHeader
