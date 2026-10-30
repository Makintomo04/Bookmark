// The books on a profile with a review the viewer may read, newest finish first: what the reviews section
// lists, its page shows and the reviews stat counts, so the number always matches the list. A plain module
// (not the "use client" ProfileReviews) so server pages can call it too.

type Reviewable = { review: string | null; completedAt: string | Date | null };

const time = (date: string | Date | null) => (date ? new Date(date).getTime() : 0);

export function reviewedBooks<T extends Reviewable>(books: T[]): (T & { review: string })[] {
  return books
    .filter((b): b is T & { review: string } => !!b.review)
    .sort((a, b) => time(b.completedAt) - time(a.completedAt));
}

// The owner's reviews stat: their finished books with a review (ProfileHead counts the same from their shelf).
export function shelfReviewCount(books: (Reviewable & { status: string })[]): number {
  return reviewedBooks(books.filter((b) => b.status === "COMPLETED")).length;
}
