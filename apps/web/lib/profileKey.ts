// The SWR key a profile is read under (usePublicProfile); `books: false` leaves out the shelf, for the
// owner's header, whose books come from /api/books. Its own file so server pages can name it too.
export const publicProfileKey = (username: string, { books = true } = {}) =>
  `/api/users/${encodeURIComponent(username)}${books ? "" : "?books=0"}`

// Someone else's Finished and Want to read in full, without reviews (PublicShelves, past the page's preview).
export const publicShelfKey = (username: string) => `/api/users/${encodeURIComponent(username)}?books=shelf`

// Your own active reading circles, keyed by your shelf book (lib/sharedCircles.ts ownCircles): only ever the page's
// SWR fallback, never fetched, so Continue reading pins a circle's book first on the first paint rather than when
// /api/buddy-reads arrives.
export const ownCirclesKey = "profile:own-circles"
