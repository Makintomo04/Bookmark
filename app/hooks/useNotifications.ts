import useSWR from "swr"

export default function useNotifications() {
  const fetcher = (url: string) => fetch(url).then(r => r.json())
  const { data, error, isLoading, mutate } = useSWR(`/api/notifications`, fetcher, { refreshInterval: 30000 })

  return {
    notifications: data?.notifications ?? [],
    unreadCount: data?.unreadCount ?? 0,
    isLoading,
    isError: error,
    mutate
  }
}
