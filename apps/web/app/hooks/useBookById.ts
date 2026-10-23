import useSWR from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"

export default function useBookById (id:string) {
  const url = `/api/books/${id}`
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, swrOptions)

  return {
    specificBook: data,
    isLoading,
    isError: error,
    mutate
  }
}