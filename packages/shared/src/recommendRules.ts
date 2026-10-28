// Client-safe pieces of book recommendations (lib/recommendations.ts holds the database side).

// Most people a book can be sent to in one go, and the longest note that goes with it.
export const RECOMMEND_MAX_FRIENDS = 10;
export const RECOMMEND_MESSAGE_MAX = 280;

export interface RecommendFriend {
  username: string;
  displayName?: string | null;
  image: string | null;
  favColour: string | null;
  // They already have this book on a shelf, so sending it would be noise.
  hasBook: boolean;
}

export const RECOMMENDED_BY_MAX = 60;

// /api/books adds recommendedBy to each of the reader's own books: the recommender's @username, or the
// name typed in for someone who isn't on Bookmark.
export type WithRecommender = { recommendedBy?: string | null };

export const recommendedByOf = (book: object) => (book as WithRecommender).recommendedBy ?? null;
