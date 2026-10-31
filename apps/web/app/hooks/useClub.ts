import useSWR from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"
import type { ClubView } from "@/lib/clubsServer"

// The club page. It changes slowly (members, the next book), so it revalidates on focus rather than polling.
export default function useClub(id: string, fallbackData?: ClubView) {
  const { data, error, isLoading, mutate } = useSWR<ClubView>(`/api/clubs/${id}`, fetcher, { ...swrOptions, fallbackData, revalidateOnFocus: true })
  return { view: data, isLoading, isError: error, mutate }
}
