import { preload } from "react-dom";

// Starts the reader's shelf (/api/books, which useBooks reads) downloading as soon as the page's HTML
// arrives, rather than once the page's scripts have run. useBooks' request then picks up the response.
// For their own profile and shelf pages, the ones that show it.
export function preloadShelf() {
  preload("/api/books/", { as: "fetch", crossOrigin: "anonymous" });
}
