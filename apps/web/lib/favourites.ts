// Favourites are a ranking. User.favouriteIds is stored oldest first (a new favourite is pushed on the end), and
// everything that shows them reads it newest first, so the rank is the stored order reversed: #1 is the last id.
// Keeping the storage as it was means nobody's existing favourites need migrating.

// How many of the ranking show on a profile; the Favourites page numbers these.
export const TOP_FAVOURITES = 4

// The ids as ranked, #1 first.
export const rankedFavouriteIds = (stored: readonly string[]): string[] => stored.slice().reverse()

// The ids to store for a ranking given #1 first.
export const storedFavouriteIds = (ranked: readonly string[]): string[] => ranked.slice().reverse()

// Whether `ranked` is the same set of ids as `stored`, only in another order: what a reorder must be.
export function isReorderOf(stored: readonly string[], ranked: readonly string[]): boolean {
  if (ranked.length !== stored.length || new Set(ranked).size !== ranked.length) return false
  const have = new Set(stored)
  return ranked.every((id) => have.has(id))
}

// The ids to store once `id` is favourited: it takes the next place in the top four while that has room, and
// after that goes in just below it, at number 5, so a new favourite never pushes out one you've ranked.
export function withFavourite(stored: readonly string[], id: string): string[] {
  const ranked = rankedFavouriteIds(stored).filter((rankedId) => rankedId !== id)
  ranked.splice(Math.min(ranked.length, TOP_FAVOURITES), 0, id)
  return storedFavouriteIds(ranked)
}
