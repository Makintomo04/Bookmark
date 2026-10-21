import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then(r => r.ok ? r.json() : { description: null })

// Open Library's blurb for a work. Pass null to skip fetching (no work key, e.g. a book added by hand).
export default function useBookDescription(workKey?: string | null) {
  const { data, isLoading } = useSWR<{ description: string | null }>(
    workKey ? `/api/books/details?workKey=${encodeURIComponent(workKey)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  return {
    description: data?.description ?? null,
    isLoading,
  }
}
