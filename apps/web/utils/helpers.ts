import { GENRES as GENRE_LIST } from "@/lib/genres";

export function calculatePercentageComplete(totalPages:number, currentPage:number) {
  if (totalPages === 0) {
    // Handle potential division by zero
    return 0;
  }

  const percentage = (currentPage / totalPages) * 100;
  return Math.round(percentage); // Round to whole number percentage
}

// Open Library covers are small and served via a redirect the browser handles well; routing them
// through next/image's optimizer made upstream 502s crash responses and spends the image quota.
export function isOpenLibraryCover(url?: string | null) {
  return !!url && url.startsWith("https://covers.openlibrary.org/")
}

// Search results show covers at thumbnail size; Open Library's -M is a third of -L's bytes and
// sharp enough there. The -L URL is still what gets saved with the book.
export function openLibraryThumb(url: string) {
  return isOpenLibraryCover(url) ? url.replace(/-L\.jpg$/, "-M.jpg") : url
}

// Each Open Library cover redirects through archive.org before any bytes arrive, so opening those
// connections while a search is still in flight takes a handshake or two off the first covers.
// Browsers close an unused preconnect after about 10s, so the hints are re-added for later searches.
const COVER_ORIGINS = ["https://covers.openlibrary.org", "https://archive.org"]
let coverLinks: HTMLLinkElement[] = []
let coverLinksAddedAt = 0
export function warmCoverConnections() {
  if (typeof document === "undefined" || Date.now() - coverLinksAddedAt < 10000) return
  coverLinksAddedAt = Date.now()
  coverLinks.forEach((link) => link.remove())
  coverLinks = COVER_ORIGINS.map((href) => {
    const link = document.createElement("link")
    link.rel = "preconnect"
    link.href = href
    return document.head.appendChild(link)
  })
}

// Genre suggestions for the add/edit book forms, kept in step with the Discover genre pages.
export const GENRES = GENRE_LIST.map((g) => g.label)

