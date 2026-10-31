import { releaseYear } from "@bookmark/shared/releases";

// Who hears that a book is out on publication day (lib/jobs/publicationDay.ts), kept apart from the job so
// the tests load it without the database.

export interface ShelfCopy {
  userId: string;
  status: string;
}

// Who hears a book is out: Want to read, and followers of its author or series who haven't already got it
// some other way (reading an advance copy, finished, set aside, or marked not interested). No database.
export function publicationDayReaders({ shelf, followers, recentlyTold = new Set() }: { shelf: ShelfCopy[]; followers: string[]; recentlyTold?: Set<string> }): string[] {
  const wants = new Set<string>();
  const has = new Set<string>();
  for (const copy of shelf) (copy.status === "NOT_STARTED" ? wants : has).add(copy.userId);
  for (const userId of followers) if (!has.has(userId)) wants.add(userId);
  return Array.from(wants).filter((userId) => !has.has(userId) && !recentlyTold.has(userId));
}

// A release date only counts as one when it's in the book's first year (or the year isn't known): a
// reissue's date isn't publication day.
export const isFirstRelease = (work: { releaseDate: string; firstPublishYear: number | null }) =>
  work.firstPublishYear == null || work.firstPublishYear === releaseYear(work.releaseDate);
