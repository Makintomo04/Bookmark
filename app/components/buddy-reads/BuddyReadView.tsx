"use client"
import { FC, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import moment from 'moment'
import { toast } from 'react-toastify'
import { ArrowLeft } from 'lucide-react'
import type { Book } from '@prisma/client'
import useBuddyRead from '@/app/hooks/useBuddyRead'
import useBooks from '@/app/hooks/useBooks'
import useBookUpdateModal from '@/app/hooks/useBookUpdateModal'
import type { BuddyReadView as View } from '@/lib/buddyReadsServer'
import { formatPercent } from '@/lib/buddyReads'
import BookCover from '../cards/BookCover'
import FetchErrorState from '../FetchErrorState'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'
import ProgressTrack from './ProgressTrack'
import Discussion from './Discussion'
import InvitePanel from './InvitePanel'

interface BuddyReadViewProps {
  id: string
  initial: View
}

const BuddyReadView: FC<BuddyReadViewProps> = ({ id, initial }) => {
  const router = useRouter()
  const { view, isError, mutate } = useBuddyRead(id, initial)
  const { books, mutate: refreshBooks } = useBooks()
  const bookUpdateModal = useBookUpdateModal()

  // Saving progress in the book modal refreshes the shelf; pick that up straight away rather than at the next poll.
  const myBook = view ? ((books ?? []) as Book[]).find((b) => b.id === view.viewer.bookId) : undefined
  const bookStamp = myBook ? `${myBook.status}:${myBook.currentPage}:${myBook.pages}` : ""
  const lastStamp = useRef(bookStamp)
  useEffect(() => {
    if (bookStamp && lastStamp.current && bookStamp !== lastStamp.current) mutate()
    lastStamp.current = bookStamp
  }, [bookStamp, mutate])

  if (!view) return <FetchErrorState error={isError} what="this reading circle" onRetry={() => mutate()} />

  const { buddyRead, viewer, members, comments } = view
  const archived = buddyRead.status === "ARCHIVED"
  const notStarted = moment(buddyRead.startsAt).isAfter(moment())

  const updateProgress = async () => {
    // The cached shelf can predate joining; check the server before saying the book is gone.
    const book = myBook ?? ((await refreshBooks()) as Book[] | undefined)?.find((b) => b.id === view?.viewer.bookId)
    if (!book) {
      toast.info("This book isn't on your shelf any more. Rejoin from the invite link to add it back.", { position: "bottom-center" })
      return
    }
    bookUpdateModal.setBookIdState(book.id)
    bookUpdateModal.setBook(book, book.status === "COMPLETED")
    bookUpdateModal.onOpen(book.id)
  }

  const setStatus = (status: "ACTIVE" | "FINISHED" | "ARCHIVED") => {
    if (status === "ARCHIVED" && !window.confirm("Archive this reading circle? It's hidden from everyone's list and closed to new comments.")) return
    axios.patch(`/api/buddy-reads/${id}`, { status }).then(() => mutate())
      .catch((err) => toast.error(err?.response?.data?.error || "Couldn't update it.", { position: "bottom-center" }))
  }

  const remove = (userId: string, username: string | null) => {
    if (!window.confirm(`Remove ${username ?? "this reader"}? Their comments will be hidden too.`)) return
    axios.delete(`/api/buddy-reads/${id}/members/${userId}`).then(() => mutate())
      .catch((err) => toast.error(err?.response?.data?.error || "Couldn't remove them.", { position: "bottom-center" }))
  }

  const leave = () => {
    if (!window.confirm("Leave this reading circle? The book stays on your shelf.")) return
    axios.delete(`/api/buddy-reads/${id}/members/${viewer.userId}`).then(() => router.push("/circles"))
      .catch((err) => toast.error(err?.response?.data?.error || "Couldn't leave.", { position: "bottom-center" }))
  }

  return (
    <div className="flex flex-col gap-10">
      <Link href="/circles" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} aria-hidden /> Reading circles
      </Link>

      <header className="flex gap-5">
        <BookCover
          book={{ title: buddyRead.title, author: buddyRead.author, coverImage: buddyRead.coverImage ?? "", cardColour: buddyRead.cardColour }}
          variant="thumb"
          sizes="112px"
          className="w-20 sm:w-28 shrink-0 self-start shadow-sm"
        />
        <div className="min-w-0 flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reading circle{buddyRead.status === "FINISHED" ? " · finished" : archived ? " · archived" : ""}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight break-words">{buddyRead.title}</h1>
          <p className="text-muted-foreground">{buddyRead.author}</p>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>
            {notStarted ? `Starts ${moment(buddyRead.startsAt).format("D MMMM")}` : `Started ${moment(buddyRead.startsAt).format("D MMMM YYYY")}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={updateProgress} className={primaryButtonClass}>
              Update my progress · {formatPercent(viewer.progress)}
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-10 min-w-0">
          <ProgressTrack members={members} schedule={buddyRead.schedule} onRemove={viewer.isHost ? remove : undefined} />
          <Discussion
            buddyReadId={id}
            comments={comments}
            viewerProgress={viewer.progress}
            isHost={viewer.isHost}
            canPost={!archived}
            onChange={() => mutate()}
          />
        </div>

        <aside className="flex flex-col gap-8 lg:sticky lg:top-6 lg:self-start">
          {!archived && <InvitePanel buddyReadId={id} inviteCode={buddyRead.inviteCode} memberCount={members.length} />}
          <section className="flex flex-col gap-2 text-sm">
            <h2 className="font-semibold">How it works</h2>
            <p className="text-muted-foreground">
              Comments are pinned to how far their writer had read. You&apos;ll see each one once you reach that point, and you can always see your own.
            </p>
          </section>
          <section className="flex flex-col items-start gap-2">
            {viewer.isHost ? (
              <>
                {buddyRead.status === "ACTIVE" && <button type="button" onClick={() => setStatus("FINISHED")} className={secondaryButtonClass}>Mark as finished</button>}
                {buddyRead.status !== "ACTIVE" && <button type="button" onClick={() => setStatus("ACTIVE")} className={secondaryButtonClass}>Reopen</button>}
                {!archived && <button type="button" onClick={() => setStatus("ARCHIVED")} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Archive</button>}
              </>
            ) : (
              <button type="button" onClick={leave} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Leave this reading circle</button>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

export default BuddyReadView
