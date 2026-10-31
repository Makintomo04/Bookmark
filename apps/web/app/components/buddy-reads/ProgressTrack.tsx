"use client"
import { FC } from 'react'
import { readerName } from '@/lib/profile'
import ReaderName from '@/app/components/profile/ReaderName'
import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'
import { formatPercent, type BuddyReadSchedule } from '@/lib/buddyReads'
import type { BuddyReadView } from '@/lib/buddyReadsServer'
import MemberAvatar, { memberColour } from './MemberAvatar'
import StaffSeal from '@/app/components/profile-head/StaffSeal'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'

interface ProgressTrackProps {
  members: BuddyReadView["members"]
  schedule: BuddyReadSchedule
  // Shown to the host on the rows they can remove (each member's `removable`, worked out on the server).
  onRemove?: (userId: string, username: string | null) => void
}

// In a club's book the club's roles come first (its host, then co-hosts), then whoever started this book.
function roleLabel(m: BuddyReadView["members"][number]) {
  if (m.clubRole === "host") return "Club host"
  if (m.clubRole === "cohost") return "Co-host"
  return m.isHost ? "Host" : null
}

// Everyone's progress on one shared scale: a bar per reader in their own colour, with the
// schedule's checkpoints drawn across all of them so it's clear who's where in the plan.
const ProgressTrack: FC<ProgressTrackProps> = ({ members, schedule, onRemove }) => {
  const checkpoints = schedule.filter((s) => typeof s.until === "number")

  return (
    <section aria-labelledby="track-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="track-heading" className="text-lg font-semibold">Where everyone is</h2>
        <p className="text-sm text-muted-foreground">{members.length} {members.length === 1 ? "reader" : "readers"}</p>
      </div>

      <ul className="flex flex-col gap-3">
        {members.map((m) => {
          const colour = memberColour(m.favColour)
          return (
            <li key={m.userId} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <Link href={`/u/${m.username}`} className="rounded-[30%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <MemberAvatar username={m.username} image={m.image} favColour={m.favColour} size={32} />
              </Link>
              <div className="min-w-0">
                <p className="flex items-baseline gap-2 text-sm leading-tight">
                  <span className="truncate font-medium">{m.isYou ? "You" : <ReaderName reader={m} badge={m.staffBadge && <StaffSeal kind={m.staffBadge} size={16} pressable={false} className="ml-1 align-[-3px]" />} />}</span>
                  {roleLabel(m) && <span className="shrink-0 text-xs text-muted-foreground">{roleLabel(m)}</span>}
                  {m.finishedAt && <span className="shrink-0 text-xs text-muted-foreground">Finished</span>}
                </p>
                <div
                  className="relative mt-1.5 h-2 rounded-full bg-neutral-200 dark:bg-neutral-800"
                  role="progressbar"
                  aria-label={`${m.isYou ? "Your" : `${readerName(m)}'s`} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={m.progress}
                >
                  <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${m.progress}%`, background: colour }} />
                  {checkpoints.map((c, i) => (
                    <span key={i} aria-hidden className="absolute -top-0.5 -bottom-0.5 w-px bg-neutral-400/70 dark:bg-neutral-500/70" style={{ left: `${c.until}%` }} />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-12 text-right text-sm font-semibold tabular-nums">{formatPercent(m.progress)}</span>
                {/* Rows without the menu keep an empty slot so every bar ends at the same place. */}
                {onRemove && !m.removable && <span aria-hidden className="w-9" />}
                {onRemove && m.removable && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Options for ${readerName(m)}`}
                        className="grid size-9 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MoreHorizontal size={16} aria-hidden />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onRemove(m.userId, readerName(m) || null)} className="text-danger">Remove from circle</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {schedule.length > 0 && (
        <ol className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {schedule.map((s, i) => (
            <li key={i} className="tabular-nums">
              <span className="font-medium text-foreground">{s.label}</span>
              {typeof s.until === "number" && <> · to {formatPercent(s.until)}</>}
              {s.due && <> · by {new Date(`${s.due}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export default ProgressTrack
