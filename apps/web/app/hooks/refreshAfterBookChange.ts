import { mutate } from "swr"
import axios from "axios"

// Everything a book save can change: the shelf, the profile counts, medals (and their notifications),
// and the reading goal.
export function refreshAfterBookChange() {
  return mutate(
    (key) =>
      typeof key === "string" &&
      (key.startsWith("/api/books") || key === "/api/user" || key === "/api/achievements" ||
        key === "/api/notifications" || key.startsWith("/api/reading-goal"))
  )
}

// Saves return straight away with the Open Library cover; copying it to our storage happens in its
// own request, without anyone waiting on it. A failed copy keeps the Open Library URL.
export function copyCoverLater(bookId: string | undefined) {
  if (!bookId) return
  axios.post(`/api/books/${bookId}/cover`)
    .then(() => mutate((key) => typeof key === "string" && key.startsWith("/api/books")))
    .catch(() => {})
}
