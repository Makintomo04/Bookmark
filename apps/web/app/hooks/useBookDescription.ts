import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then(r => r.ok ? r.json() : { description: null })

const detailsUrl = (workKey: string, book?: { title?: string | null, author?: string | null } | null) => {
  const params = new URLSearchParams({ workKey })
  if (book?.title && book.author) {
    params.set("title", book.title)
    params.set("author", book.author)
  }
  return `/api/books/details?${params}`
}

// Open Library's blurb for a work. Pass null to skip fetching (no work key, e.g. a book added by hand).
// A blurb the book already carries (a Hardcover search hit, lib/hardcover.ts) is used as it is. With the
// title and author, a work Open Library has no blurb for gets Hardcover's.
export default function useBookDescription(
  workKey?: string | null,
  given?: string | null,
  book?: { title?: string | null, author?: string | null } | null,
) {
  const { data, isLoading } = useSWR<{ description: string | null }>(
    workKey && !given ? detailsUrl(workKey, book) : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  return {
    description: given || (data?.description ?? null),
    isLoading: !given && isLoading,
  }
}
