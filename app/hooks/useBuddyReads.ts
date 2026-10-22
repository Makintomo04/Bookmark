import useSWR from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"

export type BuddyReadMemberSummary = { userId: string, username: string | null, image: string | null, favColour: string | null, progress: number }

export type BuddyReadSummary = {
  id: string
  title: string
  author: string
  coverImage: string | null
  cardColour: string | null
  status: "ACTIVE" | "FINISHED" | "ARCHIVED"
  startsAt: string
  isHost: boolean
  myProgress: number
  members: BuddyReadMemberSummary[]
}

// Whether the reader may host another circle (null when the list was narrowed to one book).
// `upgrade` says the refusal is one Plus would lift. See hostingAllowance() in lib/buddyReads.ts.
export type HostingSummary = { allowed: boolean, active: number, limit: number | null, plan: "free" | "plus", upgrade: boolean, message: string | null }

export type BuddyReadInviteSummary = {
  id: string
  createdAt: string
  inviter: { username: string | null, image: string | null, favColour: string | null }
  buddyRead: { id: string, title: string, author: string, coverImage: string | null, cardColour: string | null, inviteCode: string }
}

// The reader's reading circles and pending invites; with a bookId, only the ones that shelf book is in.
export default function useBuddyReads(bookId?: string | null) {
  const key = bookId === null ? null : bookId ? `/api/buddy-reads?bookId=${bookId}` : `/api/buddy-reads`
  const { data, error, isLoading, mutate } = useSWR<{ buddyReads: BuddyReadSummary[], hosting: HostingSummary | null, invites: BuddyReadInviteSummary[] }>(key, fetcher, swrOptions)

  return {
    buddyReads: data?.buddyReads,
    hosting: data?.hosting ?? null,
    invites: data?.invites ?? [],
    isLoading,
    isError: error,
    mutate,
  }
}
