import useSWR from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"
import type { ListSummary } from "@/lib/lists"


// Any list change (create, edit, add a book) revalidates every key under /api/lists.
export const isListsKey = (key: unknown) => typeof key === "string" && key.startsWith("/api/lists")

export function useOwnerLists(username?: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ListSummary[]>(username ? `/api/lists?owner=${encodeURIComponent(username)}&limit=50` : null, fetcher, swrOptions)
  // isError matters: an empty array on failure would read as "no lists yet".
  return { lists: Array.isArray(data) ? data : [], isLoading, isError: error, mutate }
}

export interface MyList {
  id: string
  title: string
  visibility: "PRIVATE" | "PUBLIC"
  items: { workKey: string | null, title: string, author: string }[]
}

export function useMyLists(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR<MyList[]>(enabled ? "/api/lists/mine" : null, fetcher, swrOptions)
  return { lists: Array.isArray(data) ? data : [], isLoading, isError: error, mutate }
}
