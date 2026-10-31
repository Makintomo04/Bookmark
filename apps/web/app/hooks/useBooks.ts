import { useCallback } from "react"
import useSWR, { useSWRConfig, type KeyedMutator, type MutatorOptions } from "swr"
import { fetcher, swrOptions } from "@/lib/fetcher"

const KEY = `/api/books/`

// The reader's whole shelf. `onlyWhen` is for the modals every page carries (app/(main)/layout.tsx): they
// read the shelf only while open, and then use the one already loaded if there is one, so a page that
// doesn't show the shelf never downloads it. mutate() refreshes the shelf either way.
export default function useBooks ({ onlyWhen }: { onlyWhen?: boolean } = {}) {
  const lazy = onlyWhen !== undefined
  const { data, error, isLoading } = useSWR(
    lazy && !onlyWhen ? null : KEY,
    fetcher,
    lazy ? { ...swrOptions, revalidateIfStale: false } : swrOptions,
  )
  // The shelf's own key, so it works while a modal's subscription is off. The arguments pass on as given:
  // SWR reads mutate(key) as "refetch" but mutate(key, undefined) as "set to nothing".
  const { mutate: mutateKey } = useSWRConfig()
  const mutate = useCallback(
    ((...args: [unknown?, (boolean | MutatorOptions)?]) => mutateKey(KEY, ...args)) as KeyedMutator<any>,
    [mutateKey],
  )

  return {
    books: data,
    isLoading,
    isError: error,
    mutate
  }
}
