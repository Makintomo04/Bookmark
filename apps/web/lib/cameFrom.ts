// Where a reader was before they opened a book's page, so its breadcrumb leads back there rather than
// always to Discover. Kept per tab in sessionStorage by RouteTrail; book pages themselves aren't
// recorded, so going from one book to the next in a series still leads back to where you started.
export const CAME_FROM_KEY = "bookmark:came-from"

export interface CameFrom {
  path: string
  label: string
}

const TITLE_SUFFIX = / \| Bookmark$/

export const isBookPath = (path: string) => path.startsWith("/books/")

// What the crumb says: the page's own title where it has one ("Sam's reading", "Books by Ursula K. Le Guin",
// a list's name), or a name for the section from its path.
export const crumbLabel = (path: string, title: string): string => {
  // A profile's title is "Sam's reading"; the crumb is just the reader.
  const own = title.replace(TITLE_SUFFIX, "").replace(path.startsWith("/u/") ? /['’]s reading$/ : /$^/, "").trim()
  if (own && own !== "Home" && own !== "Bookmark") return own
  const section = path.split(/[/?#]/)[1] ?? ""
  if (!section) return "Home"
  return section.charAt(0).toUpperCase() + section.slice(1).replace(/-/g, " ")
}

export const readCameFrom = (): CameFrom | null => {
  try {
    const raw = sessionStorage.getItem(CAME_FROM_KEY)
    const value = raw ? JSON.parse(raw) : null
    return value && typeof value.path === "string" && typeof value.label === "string" ? value : null
  } catch {
    return null
  }
}

export const writeCameFrom = (value: CameFrom) => {
  try {
    sessionStorage.setItem(CAME_FROM_KEY, JSON.stringify(value))
  } catch {
    // Private windows can refuse storage; the crumb then just offers Home.
  }
}
