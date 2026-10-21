import useSWR from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"

export default function useFeed() {
  const { data, error, isLoading, mutate } = useSWR(`/api/feed`, fetcher, swrOptions)

  return {
    activities: data,
    isLoading,
    isError: error,
    mutate
  }
}
