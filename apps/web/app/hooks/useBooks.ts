import useSWR from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"

export default function useBooks () {
  const { data, error, isLoading,mutate } = useSWR(`/api/books/`, fetcher, swrOptions)
 
  return {
    books: data,
    isLoading,
    isError: error,
    mutate
  }
}