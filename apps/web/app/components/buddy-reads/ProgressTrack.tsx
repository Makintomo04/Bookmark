"use client"
import { FC, ReactNode, useEffect, useRef, useState } from 'react'
import { readerName } from '@/lib/profile'
import ReaderName from '@/app/components/profile/ReaderName'
import Link from 'next/link'
import { ChevronDown, MoreHorizontal, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { circleStanding, formatPercent, trackRows, type BuddyReadSchedule } from '@/lib/buddyReads'
import type { BuddyReadView } from '@/lib/buddyReadsServer'
import MemberAvatar, { memberColour } from './MemberAvatar'
import StaffSeal from '@/app/components/profile-head/StaffSeal'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'

type Member = BuddyReadView["members"][number]

interface ProgressTrackProps {
  members: Member[]
  schedule: BuddyReadSchedule
  status: string
  // Shown to the host on the rows they can remove (each member's `removable`, worked out on the server).
  onRemove?: (userId: string, username: string | null) => void
  // Opens the invite sheet; left out when there's no way to invite from here.
  onInvite?: () => void
  // "Update my progress", under the summary.
  children?: ReactNode
}

// In a club's book the club's roles come first (its host, then co-hosts), then whoever started this book.
function roleLabel(m: Member) {
  if (m.clubRole === "host") return "Club host"
  if (m.clubRole === "cohost") return "Co-host"
  return m.isHost ? "Host" : null
}

const AVATAR = 28
const YOU = 34

// Readers close enough on the line to overlap share one spot: you if you're among them, else the furthest along, with "+N".
type Stack = { lead: Member, rest: Member[], x: number }
export function stackAvatars(members: Member[], width: number): Stack[] {
  const xOf = (m: Member) => Math.min(width - YOU / 2, Math.max(YOU / 2, (m.progress / 100) * width))
  const sorted = [...members].sort((a, b) => a.progress - b.progress)
  const groups: Member[][] = []
  for (const m of sorted) {
    const last = groups[groups.length - 1]
    if (last && xOf(m) - xOf(last[0]) < (AVATAR + YOU) / 2) last.push(m)
    else groups.push([m])
  }
  return groups.map((g) => {
    const lead = g.find((m) => m.isYou) ?? g[g.length - 1]
    return { lead, rest: g.filter((m) => m !== lead), x: xOf(lead) }
  })
}

// Everyone on one shared 0–100% line, with a sentence saying where you stand. The full list, with roles and
// the host's Remove, opens underneath.
const ProgressTrack: FC<ProgressTrackProps> = ({ members, schedule, status, onRemove, onInvite, children }) => {
  const checkpoints = schedule.filter((s) => typeof s.until === "number")
  const you = members.find((m) => m.isYou)
  const lineRef = useRef<HTMLDivElement>(null)
  // A phone's width until measured, so the first paint is close.
  const [width, setWidth] = useState(320)
  useEffect(() => {
    const el = lineRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const [listOpen, setListOpen] = useState(false)
  // A big club's book (BOO-79) lists the readers nearest you until you ask for everyone.
  const [everyone, setEveryone] = useState(false)
  const { shown, hidden } = everyone ? { shown: members, hidden: 0 } : trackRows(members)

  const { summary } = circleStanding({
    status,
    myProgress: you?.progress ?? 0,
    members: members.map((m) => ({ progress: m.progress, isYou: m.isYou, name: m.isYou ? "You" : readerName(m) || null })),
  })
  // The first sentence is about you, so it's the one in full colour.
  const split = summary.indexOf(". ")
  const lead = split === -1 ? summary : summary.slice(0, split + 1)
  const rest = split === -1 ? "" : summary.slice(split + 2)

  return (
    <section aria-labelledby="track-heading" className="flex flex-col gap-3">
      <h2 id="track-heading" className="sr-only">Where everyone is</h2>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setListOpen(!listOpen)}
          aria-expanded={listOpen}
          aria-controls="track-readers"
          className="-ml-2 inline-flex h-11 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {members.length} {members.length === 1 ? "reader" : "readers"}
          <ChevronDown size={14} aria-hidden className={cn("transition-transform", listOpen && "rotate-180")} />
        </button>
        {onInvite && (
          <button
            type="button"
            onClick={onInvite}
            className="-mr-2 inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <UserPlus size={16} aria-hidden /> Invite
          </button>
        )}
      </div>

      {/* Drawn for the eye; the sentence underneath and the readers list carry it for screen readers. */}
      <div ref={lineRef} aria-hidden className="relative h-14">
        <span className="absolute inset-x-0 top-[22px] h-1 rounded-full bg-neutral-200 dark:bg-neutral-800" />
        {you && (
          <span
            className="absolute left-0 top-[22px] h-1 rounded-full transition-[width] duration-700"
            style={{ width: `${you.progress}%`, background: memberColour(you.favColour) }}
          />
        )}
        {checkpoints.map((c, i) => (
          <span key={i} className="absolute top-[18px] h-3 w-px bg-neutral-400/70 dark:bg-neutral-500/70" style={{ left: `${c.until}%` }} />
        ))}
        {stackAvatars(members, width).map(({ lead: m, rest: others, x }) => {
          const size = m.isYou ? YOU : AVATAR
          return (
            <span
              key={m.userId}
              className={cn("absolute flex flex-col items-center transition-[left] duration-700", m.isYou ? "z-10" : "")}
              style={{ left: x - size / 2, top: 24 - size / 2 }}
              title={[m, ...others].map((r) => `${r.isYou ? "You" : readerName(r)}, ${formatPercent(r.progress)}`).join("\n")}
            >
              <span className="relative">
                <MemberAvatar
                  username={m.username}
                  image={m.image}
                  favColour={m.favColour}
                  size={size}
                  className={m.isYou ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "ring-2 ring-background"}
                />
                {others.length > 0 && (
                  <span className="absolute -right-2 -top-1.5 rounded-full bg-neutral-700 px-1 text-[11px] font-semibold leading-4 tabular-nums text-white ring-2 ring-background dark:bg-neutral-600">
                    +{others.length}
                  </span>
                )}
              </span>
              {m.isYou && <span className="mt-1 text-[11px] font-semibold leading-none">You</span>}
            </span>
          )
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{lead}</span>{rest && ` ${rest}`}
      </p>

      {schedule.length > 0 && (
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {schedule.map((s, i) => (
            <li key={i} className="tabular-nums">
              <span className="font-medium text-foreground">{s.label}</span>
              {typeof s.until === "number" && <> · to {formatPercent(s.until)}</>}
              {s.due && <> · by {new Date(`${s.due}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</>}
            </li>
          ))}
        </ol>
      )}

      {listOpen && (
        <div id="track-readers" className="flex flex-col gap-2">
          <ul className="flex flex-col">
            {shown.map((m) => (
              <li key={m.userId} className="flex min-h-11 items-center gap-3">
                <Link href={`/u/${m.username}`} className="rounded-[30%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <MemberAvatar username={m.username} image={m.image} favColour={m.favColour} size={28} />
                </Link>
                <p className="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
                  <span className="truncate font-medium">{m.isYou ? "You" : <ReaderName reader={m} badge={m.staffBadge && <StaffSeal kind={m.staffBadge} size={16} pressable={false} className="ml-1 align-[-3px]" />} />}</span>
                  {roleLabel(m) && <span className="shrink-0 text-xs text-muted-foreground">{roleLabel(m)}</span>}
                  {m.finishedAt && <span className="shrink-0 text-xs text-muted-foreground">Finished</span>}
                </p>
                <span className="text-sm font-semibold tabular-nums">{formatPercent(m.progress)}</span>
                {/* Rows without the menu keep an empty slot so the percents line up. */}
                {onRemove && !m.removable && <span aria-hidden className="w-11" />}
                {onRemove && m.removable && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Options for ${readerName(m)}`}
                        className="grid size-11 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MoreHorizontal size={16} aria-hidden />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onRemove(m.userId, readerName(m) || null)} className="min-h-11 text-danger">Remove from circle</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <button type="button" onClick={() => setEveryone(true)} className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Show everyone ({hidden} more)
            </button>
          )}
        </div>
      )}

      {children}
    </section>
  )
}

export default ProgressTrack
