import useSWR from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"
import type { ClubRole } from "@/lib/clubs"
import type { HostingSummary } from "./useBuddyReads"

export type ClubSummary = {
  id: string
  name: string
  about: string | null
  role: ClubRole
  memberCount: number
  // Archived by its host: listed after the active ones, marked, and reading nothing.
  archived?: boolean
  // What it's reading, or (with `upcoming`) the next book when nothing has started yet.
  current: { id: string, title: string, author: string, coverImage: string | null, cardColour: string | null, startsAt: string, upcoming: boolean } | null
}

// The reader's clubs (archived ones last), and whether they may start another (lib/clubs.ts clubAllowance).
export default function useClubs() {
  const { data, error, isLoading, mutate } = useSWR<{ clubs: ClubSummary[], hosting: HostingSummary }>("/api/clubs", fetcher, swrOptions)
  return { clubs: data?.clubs, hosting: data?.hosting ?? null, isLoading, isError: error, mutate }
}
