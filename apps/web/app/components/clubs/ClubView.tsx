"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import moment from 'moment'
import { ArrowLeft, Check, Link2, MoreHorizontal, Plus } from 'lucide-react'
import { notify, apiError } from '@/lib/notify'
import { readerName } from '@/lib/profile'
import { isUpgradeRequired } from '@/lib/entitlements'
import { formatPercent } from '@/lib/buddyReads'
import { CLUB_ABOUT_MAX, CLUB_MUTED_MESSAGE, CLUB_NAME_MAX, MEMBERS_SHOWN, canMuteInClubNow, canRemoveFromClubNow, canSetCoHost, circleSlotsLeft, clubReadingEmpty, matchesMember } from '@/lib/clubs'
import type { ClubView as View } from '@/lib/clubsServer'
import useClub from '@/app/hooks/useClub'
import ReaderName from '@/app/components/profile/ReaderName'
import StaffSeal from '@/app/components/profile-head/StaffSeal'
import BookCover from '../cards/BookCover'
import FetchErrorState from '../FetchErrorState'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'
import MemberAvatar from '../buddy-reads/MemberAvatar'
import HandOverDialog from '../buddy-reads/HandOverDialog'
import UpgradePrompt from '../plus/UpgradePrompt'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { ClearableInput } from '@/app/components/ui/clearable-input'
import ClubVoteSection from './ClubVoteSection'

type Circle = View["reading"][number]

const ROLE_LABEL = { host: "Host", cohost: "Co-host", member: null } as const
const linkClass = "text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
const inputClass = "w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

// A book the club is reading or will read. Members open its circle; someone who joined the club after it
// started (and so isn't in it) sees the book only.
const CircleCard: FC<{ circle: Circle, upcoming?: boolean }> = ({ circle, upcoming }) => {
  const inner = (
    <>
      <BookCover book={{ title: circle.title, author: circle.author, coverImage: circle.coverImage ?? "", cardColour: circle.cardColour }} variant="thumb" sizes="64px" className="w-16 shrink-0 self-start shadow-sm" />
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <p className="font-semibold leading-snug line-clamp-2">{circle.title}</p>
        <p className="text-sm text-muted-foreground truncate">{circle.author}</p>
        <p className="text-xs text-muted-foreground" suppressHydrationWarning>
          {upcoming ? `Starts ${moment(circle.startsAt).format("D MMMM")}` : `Started ${moment(circle.startsAt).format("D MMMM")}`}
          {" · "}{circle.memberCount} {circle.memberCount === 1 ? "reader" : "readers"}
        </p>
        {circle.isMember && !upcoming && circle.myProgress !== null && (
          <p className="text-xs font-medium tabular-nums">You&apos;re at {formatPercent(circle.myProgress)}</p>
        )}
        {!circle.isMember && <p className="text-xs text-muted-foreground">You&apos;re not in this one.</p>}
      </div>
    </>
  )
  const box = "flex gap-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4"
  return circle.isMember ? (
    <Link href={`/circles/${circle.id}`} className={`${box} hover:bg-neutral-50 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>{inner}</Link>
  ) : <div className={box}>{inner}</div>
}

const ClubView: FC<{ id: string, initial: View }> = ({ id, initial }) => {
  const router = useRouter()
  const { view, isError, mutate } = useClub(id, initial)
  const [copied, setCopied] = useState(false)
  const [handingOver, setHandingOver] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initial.club.name)
  const [about, setAbout] = useState(initial.club.about ?? "")
  const [reopenRefusal, setReopenRefusal] = useState<string | null>(null)
  // Big clubs (BOO-79): the first MEMBERS_SHOWN, then "Show all", and a search once there are more.
  const [memberQuery, setMemberQuery] = useState("")
  const [allMembers, setAllMembers] = useState(false)

  if (!view) return <FetchErrorState error={isError} what="this club" onRetry={() => mutate()} />
  const { club, viewer, members, reading, upcoming, past, memberCount, memberCap, full } = view
  const archived = club.status === "ARCHIVED"
  const isHost = viewer.role === "host"
  const slots = circleSlotsLeft(reading.length + upcoming.length)
  const others = members.filter((m) => !m.isYou)
  const matching = members.filter((m) => matchesMember(m, memberQuery))
  const listed = allMembers || memberQuery.trim() ? matching : matching.slice(0, MEMBERS_SHOWN)

  const copy = async () => {
    if (!club.inviteCode) return
    const link = `${window.location.origin}/clubs/join/${club.inviteCode}`
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: `Join ${club.name} on Bookmark`, url: link })
        return
      }
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Share sheet dismissed, or clipboard blocked: nothing to do.
    }
  }

  const resetLink = () => {
    if (!window.confirm("Reset the invite link? The old link stops working straight away. Everyone already in the club stays.")) return
    axios.post(`/api/clubs/${id}/invite-link`).then(() => {
      notify.success("Invite link reset", { description: "Copy the new one to share it." })
      mutate()
    }).catch((err) => notify.error(apiError(err, "Couldn't reset the invite link.")))
  }

  const setCoHost = (userId: string, coHost: boolean) => {
    axios.patch(`/api/clubs/${id}/members/${userId}`, { coHost }).then(() => mutate())
      .catch((err) => notify.error(apiError(err, "Couldn't change their role.")))
  }

  const setMuted = (userId: string, who: string, muted: boolean) => {
    if (muted && !window.confirm(`Mute ${who}? They can still read along and vote, but can't comment in the club's books or put books up. You can unmute them any time.`)) return
    const call = muted ? axios.post(`/api/clubs/${id}/members/${userId}/mute`) : axios.delete(`/api/clubs/${id}/members/${userId}/mute`)
    call.then(() => mutate()).catch((err) => notify.error(apiError(err, muted ? "Couldn't mute them." : "Couldn't unmute them.")))
  }

  const remove = (userId: string, who: string) => {
    if (!window.confirm(`Remove ${who} from the club? They'll leave the books it's reading now, and the invite link won't let them back in.`)) return
    axios.delete(`/api/clubs/${id}/members/${userId}`).then(() => mutate())
      .catch((err) => notify.error(apiError(err, "Couldn't remove them.")))
  }

  const leave = () => {
    if (isHost) {
      setHandingOver(true)
      return
    }
    if (!window.confirm("Leave this club? You'll leave the books it's reading now. The books stay on your shelf, and the ones you've finished stay in your history.")) return
    axios.delete(`/api/clubs/${id}/members/${viewer.userId}`).then(() => router.push("/circles"))
      .catch((err) => notify.error(apiError(err, "Couldn't leave the club.")))
  }

  const setStatus = (status: "ACTIVE" | "ARCHIVED") => {
    if (status === "ARCHIVED" && !window.confirm("Archive this club? Its invite link stops working, no new books can be started, and the books it's reading are marked finished. Their discussions stay open.")) return
    setReopenRefusal(null)
    axios.patch(`/api/clubs/${id}`, { status }).then(() => mutate())
      .catch((err) => {
        const body = axios.isAxiosError(err) ? err.response?.data : null
        if (isUpgradeRequired(body)) setReopenRefusal(body.error)
        else notify.error(apiError(err, "Couldn't update the club."))
      })
  }

  const save = () => {
    axios.patch(`/api/clubs/${id}`, { name, about }).then(() => {
      setEditing(false)
      mutate()
    }).catch((err) => notify.error(apiError(err, "Couldn't save the club.")))
  }

  return (
    <div className="flex flex-col gap-10">
      <Link href="/circles" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} aria-hidden /> Reading circles
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Club{archived ? " · archived" : ""}</p>
        {editing ? (
          <form onSubmit={(e) => { e.preventDefault(); save() }} className="flex max-w-xl flex-col gap-3">
            <label htmlFor="club-name" className="sr-only">Name</label>
            <input id="club-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={CLUB_NAME_MAX} className={`${inputClass} h-10`} />
            <label htmlFor="club-about" className="sr-only">About</label>
            <textarea id="club-about" value={about} onChange={(e) => setAbout(e.target.value)} maxLength={CLUB_ABOUT_MAX} rows={3} placeholder="Where you meet, what you like to read" className={`${inputClass} py-2`} />
            <div className="flex gap-2">
              <button type="submit" disabled={!name.trim()} className={primaryButtonClass}>Save</button>
              <button type="button" onClick={() => { setEditing(false); setName(club.name); setAbout(club.about ?? "") }} className={secondaryButtonClass}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <h1 className="page-title break-words">{club.name}</h1>
            {club.about && <p className="max-w-prose text-muted-foreground whitespace-pre-line">{club.about}</p>}
          </>
        )}
        <p className="text-sm text-muted-foreground" suppressHydrationWarning>
          {memberCount} {memberCount === 1 ? "member" : "members"}{viewer.hostPlus ? ` of ${memberCap}` : ""} · Since {moment(club.createdAt).format("MMMM YYYY")}
          {past.length > 0 ? ` · ${past.length} ${past.length === 1 ? "book" : "books"} read` : ""}
        </p>
        {viewer.muted && !archived && <p role="status" className="max-w-prose rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-sm text-muted-foreground">{CLUB_MUTED_MESSAGE}</p>}
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-10 min-w-0">
          <section aria-labelledby="reading-heading" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="reading-heading" className="text-lg font-semibold">Reading now</h2>
              {viewer.canManage && slots > 0 && (
                <Link href={`/circles/new?clubId=${id}`} className={primaryButtonClass}><Plus size={16} aria-hidden />Start the next book</Link>
              )}
            </div>
            {reading.length > 0 ? (
              <ul className="grid gap-4 md:grid-cols-2">{reading.map((c) => <li key={c.id}><CircleCard circle={c} /></li>)}</ul>
            ) : (
              <p className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-sm text-muted-foreground">
                {clubReadingEmpty({ archived, isHost, canManage: viewer.canManage, upcoming: upcoming.length })}
              </p>
            )}
          </section>

          {upcoming.length > 0 && (
            <section aria-labelledby="next-heading" className="flex flex-col gap-3">
              <h2 id="next-heading" className="text-lg font-semibold">Up next</h2>
              <ul className="grid gap-4 md:grid-cols-2">{upcoming.map((c) => <li key={c.id}><CircleCard circle={c} upcoming /></li>)}</ul>
            </section>
          )}

          <ClubVoteSection clubId={id} canManage={viewer.canManage} archived={archived} />

          {past.length > 0 && (
            <section aria-labelledby="past-heading" className="flex flex-col gap-3">
              <h2 id="past-heading" className="text-lg font-semibold">Past reads</h2>
              <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
                {past.map((c) => {
                  const cover = <BookCover book={{ title: c.title, author: c.author, coverImage: c.coverImage ?? "", cardColour: c.cardColour }} variant="thumb" sizes="96px" className="w-full shadow-sm" />
                  return (
                    <li key={c.id} className="flex flex-col gap-1">
                      {c.isMember ? <Link href={`/circles/${c.id}`} aria-label={c.title}>{cover}</Link> : cover}
                      <span className="text-xs text-muted-foreground" suppressHydrationWarning>{moment(c.startsAt).format("MMM YYYY")}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-8 lg:sticky lg:top-6 lg:self-start">
          {club.inviteCode && (
            <section aria-labelledby="club-invite-heading" className="flex flex-col gap-3">
              <h2 id="club-invite-heading" className="text-sm font-semibold">Invite readers</h2>
              {full ? (
                <>
                  <p className="text-sm text-muted-foreground">The club is full ({memberCap} readers).</p>
                  {/* Gate hosts, not guests: only the host sees the way to a bigger club. */}
                  {isHost && !viewer.hostPlus && <UpgradePrompt feature="bigClubs" variant="inline" />}
                </>
              ) : (
                <>
                  <button type="button" onClick={copy} className={`${secondaryButtonClass} justify-start w-full`}>
                    {copied ? <Check size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}
                    <span aria-live="polite">{copied ? "Link copied" : "Copy invite link"}</span>
                  </button>
                  <p className="text-xs text-muted-foreground">One link for the whole club. Whoever joins is added to the book it&apos;s reading and every one after.</p>
                </>
              )}
              {viewer.canManage && <button type="button" onClick={resetLink} className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">Reset link</button>}
            </section>
          )}

          <section aria-labelledby="members-heading" className="flex flex-col gap-3">
            <h2 id="members-heading" className="text-sm font-semibold">Members</h2>
            {members.length > MEMBERS_SHOWN && (
              <>
                <label htmlFor="member-search" className="sr-only">Search members</label>
                <ClearableInput id="member-search" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="Search members" className={`${inputClass} h-9`} />
              </>
            )}
            {memberQuery.trim() && matching.length === 0 && <p className="text-sm text-muted-foreground">Nobody here by that name.</p>}
            <ul className="flex flex-col gap-2">
              {listed.map((m) => {
                const who = readerName(m) || "this reader"
                const canRemove = !m.isYou && canRemoveFromClubNow(viewer.role, m.role, !archived)
                // An archived club's host can still take co-host away and remove readers, but makes no new co-hosts.
                const canPromote = !m.isYou && m.role === "member" && canSetCoHost(viewer.role, true, !archived)
                const canDemote = !m.isYou && m.role === "cohost" && canSetCoHost(viewer.role, false, !archived)
                const canMute = !m.isYou && canMuteInClubNow(viewer.role, m.role, !archived)
                return (
                  <li key={m.userId} className="flex items-center gap-3">
                    <Link href={m.username ? `/u/${m.username}` : "#"} className="flex min-w-0 flex-1 items-center gap-3">
                      <MemberAvatar username={m.username} image={m.image} favColour={m.favColour} size={32} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        <ReaderName reader={m} badge={m.staffBadge && <StaffSeal kind={m.staffBadge} size={16} pressable={false} className="ml-1 align-[-3px]" />} />
                      </span>
                    </Link>
                    {m.muted && <span className="shrink-0 text-xs text-muted-foreground">Muted</span>}
                    {ROLE_LABEL[m.role] && <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABEL[m.role]}</span>}
                    {(canRemove || canPromote || canDemote || canMute) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" aria-label={`Options for ${who}`} className="grid size-9 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <MoreHorizontal size={16} aria-hidden />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canPromote && <DropdownMenuItem onSelect={() => setCoHost(m.userId, true)}>Make co-host</DropdownMenuItem>}
                          {canDemote && <DropdownMenuItem onSelect={() => setCoHost(m.userId, false)}>Remove as co-host</DropdownMenuItem>}
                          {canMute && !m.muted && <DropdownMenuItem onSelect={() => setMuted(m.userId, who, true)}>Mute</DropdownMenuItem>}
                          {canMute && m.muted && <DropdownMenuItem onSelect={() => setMuted(m.userId, who, false)}>Unmute</DropdownMenuItem>}
                          {canRemove && <DropdownMenuItem onSelect={() => remove(m.userId, who)} className="text-danger">Remove from club</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                )
              })}
            </ul>
            {!allMembers && !memberQuery.trim() && matching.length > listed.length && (
              <button type="button" onClick={() => setAllMembers(true)} className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Show all {matching.length}</button>
            )}
            {isHost && !archived && <p className="text-xs text-muted-foreground">Co-hosts can start the next book, run votes, change schedules, and invite, mute and remove members.</p>}
          </section>

          <section className="flex flex-col items-start gap-2">
            {isHost && !archived && !editing && <button type="button" onClick={() => setEditing(true)} className={linkClass}>Edit name and about</button>}
            {isHost && !archived && <button type="button" onClick={() => setStatus("ARCHIVED")} className={linkClass}>Archive the club</button>}
            {isHost && archived && <button type="button" onClick={() => setStatus("ACTIVE")} className={secondaryButtonClass}>Reopen the club</button>}
            {reopenRefusal && <UpgradePrompt feature="canHostUnlimited" variant="inline" message={reopenRefusal} />}
            {(!isHost || others.length > 0) && (
              <button type="button" onClick={leave} className={linkClass}>{isHost ? "Hand over and leave" : "Leave the club"}</button>
            )}
          </section>
        </aside>
      </div>
      {isHost && (
        <HandOverDialog
          isOpen={handingOver}
          onClose={() => setHandingOver(false)}
          buddyReadId={id}
          viewerId={viewer.userId}
          members={others}
          onLeft={() => router.push("/circles")}
          club
        />
      )}
    </div>
  )
}

export default ClubView
