import useSWR from "swr"

export default function useUser () {
  const fetcher = (url:string) => fetch(url).then(r => r.json() )
  const { data, error, isLoading, mutate } = useSWR(`/api/user`, fetcher)
 

  return {
    user: data,
    isLoading,
    isError: error,
    mutate
  }
}