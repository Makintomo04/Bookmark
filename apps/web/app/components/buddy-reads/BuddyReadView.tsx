"use client"
import { FC, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import moment from 'moment'
import { notify, apiError } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { isUpgradeRequired } from '@/lib/entitlements'
import { Archive, ArrowLeft, Bell, BellOff, Check, HelpCircle, LogOut, MoreHorizontal, RotateCcw, UserPlus } from 'lucide-react'
import type { Book } from '@prisma/client'
import useBuddyRead from '@/app/hooks/useBuddyRead'
import useBooks from '@/app/hooks/useBooks'
import useBookUpdateModal from '@/app/hooks/useBookUpdateModal'
import type { BuddyReadView as View } from '@/lib/buddyReadsServer'
import { CLUB_MUTED_MESSAGE } from '@/lib/clubs'
import BookCover from '../cards/BookCover'
import FetchErrorState from '../FetchErrorState'
import { primaryButtonClass } from '../profile-head/ProfileHeader'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu'
import Modal from '../modals/Modal'
import ProgressTrack from './ProgressTrack'
import Discussion from './Discussion'
import InvitePanel from './InvitePanel'
import HandOverDialog from './HandOverDialog'
import UpgradePrompt from '../plus/UpgradePrompt'
import AuthorLink from '@/app/components/AuthorLink'

interface BuddyReadViewProps {
  id: string
  initial: View
}

// Shown on the page the first time someone opens any circle, then only from the "…" menu.
const HOW_SEEN_KEY = "bookmark:circle-how-it-works-seen"

const HowItWorks: FC = () => (
  <>
    Comments are pinned to how far their writer had read. You&apos;ll see each one once you reach that point, and you can always see your own.
    Listening instead? Minutes count the same way: progress is a percent of your own copy.
  </>
)

const menuItemClass = "min-h-11 gap-2.5 px-3 text-sm font-medium"

const BuddyReadView: FC<BuddyReadViewProps> = ({ id, initial }) => {
  const router = useRouter()
  const { view, isError, mutate } = useBuddyRead(id, initial)
  const { books, mutate: refreshBooks } = useBooks()
  const bookUpdateModal = useBookUpdateModal()
  const [handingOver, setHandingOver] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [explaining, setExplaining] = useState(false)
  const [firstVisit, setFirstVisit] = useState(false)
  // Reopening past the hosting limit: the refusal, shown with the Plus prompt under the header.
  const [reopenRefusal, setReopenRefusal] = useState<string | null>(null)
  // Finishing, archiving and muting show straight away and are sent once their Undo toast has gone.
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [pendingMuted, setPendingMuted] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      if (!localStorage.getItem(HOW_SEEN_KEY)) {
        setFirstVisit(true)
        localStorage.setItem(HOW_SEEN_KEY, "1")
      }
    } catch {}
  }, [])

  // Saving progress in the book modal refreshes the shelf; pick that up straight away rather than at the next poll.
  const myBook = view ? ((books ?? []) as Book[]).find((b) => b.id === view.viewer.bookId) : undefined
  const bookStamp = myBook ? `${myBook.status}:${myBook.currentPage}:${myBook.pages}:${myBook.currentMinute}:${myBook.audioMinutes}` : ""
  const lastStamp = useRef(bookStamp)
  useEffect(() => {
    if (bookStamp && lastStamp.current && bookStamp !== lastStamp.current) mutate()
    lastStamp.current = bookStamp
  }, [bookStamp, mutate])

  // Once the server agrees, its own value takes over again.
  const serverStatus = view?.buddyRead.status
  const serverMuted = view?.viewer.muted
  useEffect(() => setPendingStatus(null), [serverStatus])
  useEffect(() => setPendingMuted(null), [serverMuted])

  if (!view) return <FetchErrorState error={isError} what="this reading circle" onRetry={() => mutate()} />

  const { buddyRead, club, viewer, members, comments, memberCap } = view
  const status = pendingStatus ?? buddyRead.status
  const muted = pendingMuted ?? viewer.muted
  const archived = status === "ARCHIVED"
  const notStarted = moment(buddyRead.startsAt).isAfter(moment())

  const updateProgress = async () => {
    // The cached shelf can predate joining; check the server before saying the book is gone.
    const book = myBook ?? ((await refreshBooks()) as Book[] | undefined)?.find((b) => b.id === view?.viewer.bookId)
    if (!book) {
      notify.info("This book isn't on your shelf any more.", { description: "Rejoin from the invite link to add it back." })
      return
    }
    bookUpdateModal.setBookIdState(book.id)
    bookUpdateModal.setBook(book, book.status === "COMPLETED")
    bookUpdateModal.onOpen(book.id)
  }

  const sendStatus = (next: "ACTIVE" | "FINISHED" | "ARCHIVED") => {
    setReopenRefusal(null)
    return axios.patch(`/api/buddy-reads/${id}`, { status: next }).then(() => mutate())
      .catch((err) => {
        setPendingStatus(null)
        const body = axios.isAxiosError(err) ? err.response?.data : null
        if (isUpgradeRequired(body)) setReopenRefusal(body.error)
        else notify.error(apiError(err, "Couldn't update the reading circle."), { retry: () => sendStatus(next) })
      })
  }

  // Reopening can be refused (the hosting limit), so it goes straight to the server; the others act, then offer Undo.
  const setStatus = (next: "ACTIVE" | "FINISHED" | "ARCHIVED") => {
    if (next === "ACTIVE") return sendStatus(next)
    setPendingStatus(next)
    notify.undo(next === "ARCHIVED" ? "Circle archived. It's hidden from everyone's list and closed to new comments." : "Circle marked as finished", {
      onUndo: () => setPendingStatus(null),
      commit: () => sendStatus(next),
    })
  }

  const toggleMute = () => {
    const next = !muted
    setPendingMuted(next)
    notify.undo(next ? "Muted. You won't hear about new comments here." : "Unmuted. You'll hear about new comments here again.", {
      onUndo: () => setPendingMuted(null),
      commit: () => {
        axios.patch(`/api/buddy-reads/${id}/members/${viewer.userId}`, { muted: next }).then(() => mutate())
          .catch((err) => {
            setPendingMuted(null)
            notify.error(apiError(err, next ? "Couldn't mute the reading circle." : "Couldn't unmute the reading circle."))
          })
      },
    })
  }

  const remove = (userId: string, username: string | null) => {
    if (!window.confirm(`Remove ${username ?? "this reader"}? Their comments stay, under their name, and the invite link won't let them back in.`)) return
    axios.delete(`/api/buddy-reads/${id}/members/${userId}`).then(() => mutate())
      .catch((err) => notify.error(apiError(err, "Couldn't remove them.")))
  }

  const others = members.filter((m) => !m.isYou)
  const leave = () => {
    if (viewer.isHost) {
      setHandingOver(true)
      return
    }
    if (!window.confirm("Leave this reading circle? The book stays on your shelf.")) return
    axios.delete(`/api/buddy-reads/${id}/members/${viewer.userId}`).then(() => router.push("/circles"))
      .catch((err) => notify.error(apiError(err, "Couldn't leave the reading circle.")))
  }

  // An archived club's books take only its members (lib/buddyReadsServer.ts clubBookRefusal), so there's no link to
  // share. Its host and co-hosts can still invite a member back by username, which lifts a removal.
  const clubArchived = !!club && !club.inviteCode
  const invitePanel = archived ? null
    : clubArchived ? (viewer.canModerate ? <InvitePanel buddyReadId={id} inviteCode={buddyRead.inviteCode} memberCount={members.length} clubArchived hideHeading /> : null)
    : <InvitePanel buddyReadId={id} inviteCode={buddyRead.inviteCode} memberCount={members.length} memberUsernames={members.flatMap((m) => (m.username ? [m.username] : []))} isHost={viewer.canManage} onLinkReset={() => mutate()} clubInviteCode={club?.inviteCode} memberCap={memberCap} hideHeading />

  const meta = [
    status === "FINISHED" ? "Finished" : archived ? "Archived" : null,
    buddyRead.audioMinutes ? "listening" : null,
    notStarted ? `starts ${moment(buddyRead.startsAt).format("D MMMM")}` : null,
  ].filter(Boolean).join(" · ")

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/circles" className="-my-2 inline-flex h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} aria-hidden /> Reading circles
      </Link>

      <header className="flex items-center gap-4">
        <BookCover
          book={{ title: buddyRead.title, author: buddyRead.author, coverImage: buddyRead.coverImage ?? "", cardColour: buddyRead.cardColour }}
          variant="thumb"
          sizes="80px"
          className="w-14 shrink-0 self-start shadow-sm sm:w-20"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {club && (
            <Link href={`/clubs/${club.id}`} className="w-fit text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {club.name}
            </Link>
          )}
          <h1 className="break-words font-serif text-2xl font-semibold leading-tight sm:text-3xl">{buddyRead.title}</h1>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>
            <AuthorLink author={buddyRead.author} />{meta && <> · {meta}</>}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Circle options"
              className="grid size-11 shrink-0 place-items-center rounded-full border border-neutral-300 hover:bg-neutral-100 data-[state=open]:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800 dark:data-[state=open]:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal size={18} aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-1.5">
            {invitePanel && <DropdownMenuItem onSelect={() => setInviting(true)} className={menuItemClass}><UserPlus size={16} aria-hidden />Invite readers</DropdownMenuItem>}
            {viewer.canManage && status === "ACTIVE" && <DropdownMenuItem onSelect={() => setStatus("FINISHED")} className={menuItemClass}><Check size={16} aria-hidden />Mark as finished</DropdownMenuItem>}
            {viewer.canManage && status !== "ACTIVE" && <DropdownMenuItem onSelect={() => setStatus("ACTIVE")} className={menuItemClass}><RotateCcw size={16} aria-hidden />Reopen</DropdownMenuItem>}
            <DropdownMenuItem onSelect={toggleMute} className={menuItemClass}>
              {muted ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}{muted ? "Unmute this circle" : "Mute this circle"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setExplaining(true)} className={menuItemClass}><HelpCircle size={16} aria-hidden />How locked comments work</DropdownMenuItem>
            {((viewer.canManage && !archived) || !viewer.isHost || others.length > 0) && <DropdownMenuSeparator />}
            {viewer.canManage && !archived && <DropdownMenuItem onSelect={() => setStatus("ARCHIVED")} className={`${menuItemClass} text-muted-foreground`}><Archive size={16} aria-hidden />Archive</DropdownMenuItem>}
            {viewer.isHost && others.length > 0 && <DropdownMenuItem onSelect={leave} className={`${menuItemClass} text-muted-foreground`}><LogOut size={16} aria-hidden />Hand over and leave</DropdownMenuItem>}
            {!viewer.isHost && <DropdownMenuItem onSelect={leave} className={`${menuItemClass} text-muted-foreground`}><LogOut size={16} aria-hidden />Leave this reading circle</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {reopenRefusal && <UpgradePrompt feature="canHostUnlimited" variant="inline" message={reopenRefusal} />}

      <ProgressTrack
        members={members}
        schedule={buddyRead.schedule}
        status={status}
        onRemove={viewer.canModerate ? remove : undefined}
        onInvite={invitePanel ? () => setInviting(true) : undefined}
      >
        <button type="button" onClick={updateProgress} className={cn(primaryButtonClass, "mt-1 w-full rounded-full sm:w-fit")}>
          Update my progress
        </button>
      </ProgressTrack>

      {firstVisit && (
        <p className="flex gap-2.5 text-sm text-muted-foreground">
          <HelpCircle size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span><span className="font-medium text-foreground">How it works. </span><HowItWorks /></span>
        </p>
      )}

      {viewer.clubMuted && !archived && (
        <p role="status" className="text-sm text-muted-foreground">{CLUB_MUTED_MESSAGE}</p>
      )}

      <div className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <Discussion
          buddyReadId={id}
          comments={comments}
          viewerProgress={viewer.progress}
          isHost={viewer.canModerate}
          canPost={!archived && !viewer.clubMuted}
          onChange={() => mutate()}
        />
      </div>

      <Modal
        isOpen={inviting}
        onClose={() => setInviting(false)}
        title={clubArchived ? "Invite a member back" : "Invite readers"}
        size="sm"
        compact
        sheet
        body={<div className="w-full px-6 pb-6">{invitePanel}</div>}
      />
      <Modal
        isOpen={explaining}
        onClose={() => setExplaining(false)}
        title="How locked comments work"
        size="sm"
        compact
        sheet
        body={<p className="w-full px-6 pb-6 text-sm text-muted-foreground"><HowItWorks /></p>}
      />
      {viewer.isHost && (
        <HandOverDialog
          isOpen={handingOver}
          onClose={() => setHandingOver(false)}
          buddyReadId={id}
          viewerId={viewer.userId}
          members={others}
          onLeft={() => router.push("/circles")}
        />
      )}
    </div>
  )
}

export default BuddyReadView
