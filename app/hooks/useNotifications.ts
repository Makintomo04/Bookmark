import useSWR from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"

export default function useNotifications() {
  const { data, error, isLoading, mutate } = useSWR(`/api/notifications`, fetcher, { ...swrOptions, refreshInterval: 30000 })

  return {
    notifications: data?.notifications ?? [],
    unreadCount: data?.unreadCount ?? 0,
    isLoading,
    isError: error,
    mutate
  }
}
