import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then(r => r.ok ? r.json() : { description: null })

// A book's blurb, by book key: Open Library's for a work key, the catalogue's for a catalogue Work id
// (bookKeyOf). Pass null to skip fetching (no key, e.g. a book added by hand). A blurb the book already
// carries (a Hardcover search hit, lib/hardcover.ts) is used as it is.
export default function useBookDescription(bookKey?: string | null, given?: string | null) {
  const { data, isLoading } = useSWR<{ description: string | null }>(
    bookKey && !given ? `/api/books/details?workKey=${encodeURIComponent(bookKey)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  return {
    description: given || (data?.description ?? null),
    isLoading: !given && isLoading,
  }
}
