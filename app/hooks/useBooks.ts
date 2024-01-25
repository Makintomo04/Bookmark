import useSWR from "swr"

export default function useBooks () {
  const fetcher = (url:string) => fetch(url).then(r => r.json())
  const { data, error, isLoading } = useSWR(`/api/books/`, fetcher)
 
  return {
    books: data,
    isLoading,
    isError: error
  }
}