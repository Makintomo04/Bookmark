import { isFinishedBook } from "@bookmark/shared/readerTier";
import { reviewedBooks } from "@/lib/reviewedBooks";

// Someone else's profile as its page carries it (lib/publicProfile.ts sends it, PublicProfile draws it). A
// plain module so scripts/test/profilePreview.test.ts runs under Node.

// How many books of each shelf the page carries: two rows at the widest grid (SHELF_PREVIEW) with room over.
// Their shelves load the rest when the viewer asks (PublicShelves), and "See all" pages carry their own. A
// reader with 2,000 books otherwise sent 2 MB of HTML.
export const PROFILE_SHELF_PREVIEW = 24;
// Reviews the page carries with their text: as many as the profile shows before "See all".
export const PROFILE_REVIEWS = 5;

type When = Date | string | null;
interface PreviewBook {
  id: string;
  title: string;
  author: string;
  status: string;
  timesRead: number;
  createdAt: When;
  startedAt: When;
  completedAt: When;
  review: string | null;
}

const time = (date: When) => (date ? new Date(date).getTime() : 0);
const same = (s: string) => s.trim().toLowerCase();
const sameBook = (a: PreviewBook, b: PreviewBook) => same(a.title) === same(b.title) && same(a.author) === same(b.author);

// Everything they're reading, the newest of Finished and Want to read, and the newest reviews, with the
// counts worked out from every book. Review text stays only on the reviews shown. Finished books matching one
// they're reading come too, so a re-read still says so.
export function profilePreview<B extends PreviewBook, P extends { books: B[] }>(profile: P) {
  const on = (status: string, at: (b: B) => When) =>
    profile.books.filter((b) => b.status === status).sort((a, b) => time(at(b)) - time(at(a)));
  const reading = on("STARTED", (b) => b.startedAt);
  const finished = on("COMPLETED", (b) => b.completedAt);
  const want = on("NOT_STARTED", (b) => b.createdAt);
  const reviewed = reviewedBooks(profile.books);
  const withReview = new Set(reviewed.slice(0, PROFILE_REVIEWS).map((b) => b.id));
  const kept = new Set<B>([
    ...reading,
    ...finished.slice(0, PROFILE_SHELF_PREVIEW),
    ...finished.filter((f) => reading.some((r) => sameBook(r, f))),
    ...want.slice(0, PROFILE_SHELF_PREVIEW),
    ...reviewed.slice(0, PROFILE_REVIEWS),
  ]);
  return {
    ...profile,
    books: profile.books.filter((b) => kept.has(b)).map((b): B => (withReview.has(b.id) ? b : { ...b, review: null })),
    // Re-reads under Currently reading still count as read, as on their full profile.
    booksRead: profile.books.filter(isFinishedBook).length,
    reviewCount: reviewed.length,
    shelfCounts: { finished: finished.length, want: want.length },
  };
}
