import useSWR from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"
import { BUDDY_READ_REFRESH_MS } from "@/lib/buddyReads"
import type { BuddyReadView } from "@/lib/buddyReadsServer"

// "Live" without websockets: poll while the page is open, and stop while the tab is hidden
// (SWR skips refreshInterval ticks when hidden and revalidates on focus when the reader comes back).
export default function useBuddyRead(id: string, fallbackData?: BuddyReadView) {
  const { data, error, isLoading, mutate } = useSWR<BuddyReadView>(`/api/buddy-reads/${id}`, fetcher, {
    ...swrOptions,
    fallbackData,
    refreshInterval: BUDDY_READ_REFRESH_MS,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    revalidateOnFocus: true,
  })

  return { view: data, isLoading, isError: error, mutate }
}
