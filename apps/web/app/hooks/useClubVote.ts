import useSWR from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"
import type { ClubVoteView } from "@/lib/clubVotesServer"

// The club's vote on its next book. Revalidates on focus, like the club page, so turnout and the result
// are fresh when the reader comes back to the tab.
export default function useClubVote(clubId: string) {
  const { data, error, isLoading, mutate } = useSWR<ClubVoteView>(`/api/clubs/${clubId}/votes`, fetcher, { ...swrOptions, revalidateOnFocus: true })
  return { view: data, isLoading, isError: error, mutate }
}
