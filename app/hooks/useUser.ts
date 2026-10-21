import useSWR from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"

export default function useUser () {
  const { data, error, isLoading, mutate } = useSWR(`/api/user`, fetcher, swrOptions)
 

  return {
    user: data,
    isLoading,
    isError: error,
    mutate
  }
}