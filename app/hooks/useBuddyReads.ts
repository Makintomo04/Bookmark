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

export type BuddyReadInviteSummary = {
  id: string
  createdAt: string
  inviter: { username: string | null, image: string | null, favColour: string | null }
  buddyRead: { id: string, title: string, author: string, coverImage: string | null, cardColour: string | null, inviteCode: string }
}

// The reader's buddy reads and pending invites; with a bookId, only the ones that shelf book is in.
export default function useBuddyReads(bookId?: string | null) {
  const key = bookId === null ? null : bookId ? `/api/buddy-reads?bookId=${bookId}` : `/api/buddy-reads`
  const { data, error, isLoading, mutate } = useSWR<{ buddyReads: BuddyReadSummary[], invites: BuddyReadInviteSummary[] }>(key, fetcher, swrOptions)

  return {
    buddyReads: data?.buddyReads,
    invites: data?.invites ?? [],
    isLoading,
    isError: error,
    mutate,
  }
}
