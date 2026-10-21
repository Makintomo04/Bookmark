import useSWR from "swr"

export default function useFeed() {
  const fetcher = (url: string) => fetch(url).then(r => r.json())
  const { data, error, isLoading, mutate } = useSWR(`/api/feed`, fetcher)

  return {
    activities: data,
    isLoading,
    isError: error,
    mutate
  }
}
