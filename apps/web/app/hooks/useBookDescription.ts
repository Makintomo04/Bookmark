import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then(r => r.ok ? r.json() : { description: null, headline: null })

const detailsUrl = (bookKey: string, book?: { title?: string | null, author?: string | null } | null) => {
  const params = new URLSearchParams({ workKey: bookKey })
  if (book?.title && book.author) {
    params.set("title", book.title)
    params.set("author", book.author)
  }
  return `/api/books/details?${params}`
}

// A book's blurb, by book key: Open Library's for a work key, the catalogue's for a catalogue Work id
// (bookKeyOf). Pass null to skip fetching (no key, e.g. a book added by hand). A blurb the book already
// carries (a Hardcover search hit, lib/hardcover.ts) is used as it is. With the title and author, a work
// Open Library has no blurb for gets Hardcover's.
export default function useBookDescription(
  bookKey?: string | null,
  given?: string | null,
  book?: { title?: string | null, author?: string | null } | null,
) {
  const { data, isLoading } = useSWR<{ description: string | null, headline?: string | null }>(
    bookKey && !given ? detailsUrl(bookKey, book) : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  return {
    description: given || (data?.description ?? null),
    // Only for a blurb fetched here; one the book carries comes with its own (DiscoverBook.headline).
    headline: given ? null : data?.headline ?? null,
    isLoading: !given && isLoading,
  }
}
