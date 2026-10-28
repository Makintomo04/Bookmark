import { useEffect, useState } from "react"
import { SHELF_PREVIEW } from "@/app/components/books/shelf"

// The cover grid's columns at each breakpoint (coverGridClass in components/books/shelf.tsx): 2, then 3 from
// sm, 4 from md, 5 from lg, 6 from xl. Widest first.
const COLUMNS: [query: string, columns: number][] = [
  ["(min-width: 1280px)", 6],
  ["(min-width: 1024px)", 5],
  ["(min-width: 768px)", 4],
  ["(min-width: 640px)", 3],
]

// How many covers make two rows of the cover grid on this screen: 4 on a phone up to 12 on a wide one, so
// a shelf's preview is the same height everywhere and the sections below it stay close. Starts at the
// widest (what the server renders) and settles on mount.
export default function useShelfPreview() {
  const [preview, setPreview] = useState(SHELF_PREVIEW)
  useEffect(() => {
    const queries = COLUMNS.map(([query, columns]) => [window.matchMedia(query), columns] as const)
    const update = () => setPreview(2 * (queries.find(([q]) => q.matches)?.[1] ?? 2))
    update()
    queries.forEach(([q]) => q.addEventListener("change", update))
    return () => queries.forEach(([q]) => q.removeEventListener("change", update))
  }, [])
  return preview
}
