import useSWR from "swr"

export default function useBookById (id:string) {
  const url = `/api/books/${id}`
  const fetcher = (url:string) => fetch(url).then(r => r.json() )
  const { data, error, isLoading, mutate } = useSWR(url, fetcher)

  return {
    specificBook: data,
    isLoading,
    isError: error,
    mutate
  }
}