// The SWR key a profile is read under (usePublicProfile); `books: false` leaves out the shelf, for the
// owner's header, whose books come from /api/books. Its own file so server pages can name it too.
export const publicProfileKey = (username: string, { books = true } = {}) =>
  `/api/users/${encodeURIComponent(username)}${books ? "" : "?books=0"}`
