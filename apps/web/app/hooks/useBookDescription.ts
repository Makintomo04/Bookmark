import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then(r => r.ok ? r.json() : { description: null })

// Open Library's blurb for a work. Pass null to skip fetching (no work key, e.g. a book added by hand).
// A blurb the book already carries (a Hardcover search hit, lib/hardcover.ts) is used as it is.
export default function useBookDescription(workKey?: string | null, given?: string | null) {
  const { data, isLoading } = useSWR<{ description: string | null }>(
    workKey && !given ? `/api/books/details?workKey=${encodeURIComponent(workKey)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  return {
    description: given || (data?.description ?? null),
    isLoading: !given && isLoading,
  }
}
