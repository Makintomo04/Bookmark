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

export const GENRES =["Fiction", "Non-Fiction", "Fantasy", "Sci-Fi", "Mystery", "Romance", "Biography", "Self-Help"]

export enum STEPS {
  START= 0,
  USERNAME= 1,
  IMAGE= 2,
  BANNER= 3,
  BIO= 4,
  COLOUR= 5,
  COMPLETE= 6
}  