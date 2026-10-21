import useSWR from "swr"

export default function useBookNotes(bookId?: string) {
  const fetcher = (url: string) => fetch(url).then(r => r.json())
  const { data, error, isLoading, mutate } = useSWR(bookId ? `/api/books/${bookId}/notes` : null, fetcher)

  return {
    notes: data,
    isLoading,
    isError: error,
    mutate
  }
}
