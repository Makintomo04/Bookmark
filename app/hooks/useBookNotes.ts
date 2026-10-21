import useSWR from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"

export default function useBookNotes(bookId?: string) {
  const { data, error, isLoading, mutate } = useSWR(bookId ? `/api/books/${bookId}/notes` : null, fetcher, swrOptions)

  return {
    notes: data,
    isLoading,
    isError: error,
    mutate
  }
}
