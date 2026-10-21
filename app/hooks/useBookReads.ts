import useSWR from "swr"
import type { Status } from "@prisma/client"
import { fetcher, swrOptions } from "@/lib/fetcher"

export interface BookReadEntry {
  id: string
  status: Status
  startedAt: string | null
  finishedAt: string | null
  rating: number | null
  stoppedAtPage: number | null
}

export default function useBookReads(bookId?: string | null) {
  const { data, error, isLoading, mutate } = useSWR<BookReadEntry[]>(bookId ? `/api/books/${bookId}/reads` : null, fetcher, swrOptions)

  return {
    reads: data,
    isLoading,
    isError: error,
    mutate
  }
}
