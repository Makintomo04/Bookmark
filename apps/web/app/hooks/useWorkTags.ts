import useSWR from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"
import type { TagAggregate } from "@/lib/workTags"

export type WorkTagsData = TagAggregate & { workId: string | null }

// Moods and content warnings for a book: by shelf book (with the reader's own tags) or by book key, the
// Open Library work key or a catalogue Work id (bookKeyOf; the aggregate only). Pass neither to fetch nothing.
export default function useWorkTags(by: { bookId?: string | null, bookKey?: string | null }) {
  const key = by.bookId ? `/api/works/tags?bookId=${by.bookId}`
    : by.bookKey ? `/api/works/tags?workKey=${encodeURIComponent(by.bookKey)}`
    : null
  const { data, error, isLoading, mutate } = useSWR<WorkTagsData>(key, fetcher, swrOptions)
  return { tags: data, isLoading, isError: error, mutate }
}
