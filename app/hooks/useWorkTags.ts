import useSWR from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"
import type { TagAggregate } from "@/lib/workTags"

export type WorkTagsData = TagAggregate & { workId: string | null }

// Moods and content warnings for a book: by shelf book (with the reader's own tags) or by Open Library
// work key (the aggregate only). Pass neither to fetch nothing.
export default function useWorkTags(by: { bookId?: string | null, workKey?: string | null }) {
  const key = by.bookId ? `/api/works/tags?bookId=${by.bookId}`
    : by.workKey ? `/api/works/tags?workKey=${encodeURIComponent(by.workKey)}`
    : null
  const { data, error, isLoading, mutate } = useSWR<WorkTagsData>(key, fetcher, swrOptions)
  return { tags: data, isLoading, isError: error, mutate }
}
