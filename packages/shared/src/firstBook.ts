import { joinLabels } from "./genres";
import { sameBook } from "./workKey";

// The book picker (BOO-52, onboarding's "Help me pick my first book" and "Help me pick a book" after): starting points, without AI. What they already
// saved to Want to read, what people they follow loved, the team's picks, and what's popular in the genres
// they chose at sign-up. Pure, shared by GET /api/first-book and both apps' picker screens.

export type StarterSource = "wantToRead" | "friends" | "team" | "genres";

export interface StarterBook {
  key: string;
  workKey: string | null;
  // A book without an Open Library key links to its page by catalogue Work id, when it has one.
  pageWorkId?: string | null;
  title: string;
  author: string;
  coverUrl: string | null;
  pages: number | null;
  // Set on books already on the shelf (Want to read): Start moves this one to Reading.
  bookId?: string;
  // Why it's here, in a few words: "Sam rated it 5 stars", "On Cosy autumn reads".
  why?: string | null;
  // Their own words for it, when they gave some: a list note or a review snippet.
  quote?: string | null;
}

export interface StarterSection {
  source: StarterSource;
  heading: string;
  blurb: string;
  books: StarterBook[];
}

export interface FirstBookPicks {
  sections: StarterSection[];
  // Whether the reader picked any genres, so an empty picker can say what would fill it.
  hasGenres: boolean;
  // Whether AI features are on for them, so the Ask the shelf link can say it's opt-in.
  aiFeatures: boolean;
}

// How many each section shows. Want to read stays short: a list of everything saved is the shelf's job.
export const STARTER_LIMITS: Record<StarterSource, number> = { wantToRead: 6, friends: 6, team: 6, genres: 12 };

export interface StarterInput {
  wantToRead: StarterBook[];
  friends: StarterBook[];
  team: StarterBook[];
  genres: StarterBook[];
  // The genre labels the popular row came from.
  genreLabels: string[];
  // Everything on the reader's shelf, whatever its status. Only Want to read comes back from it.
  shelf: { workKey?: string | null; title: string; author: string }[];
}

// The order sections show in, which is also who wins when a book turns up twice: your own saves first,
// then people you know, then the team, then plain popularity.
const ORDER: StarterSource[] = ["wantToRead", "friends", "team", "genres"];

const authorOf = (b: { author: string }) => b.author.trim().toLowerCase();

// The sections, each without books already shown above it or already on the shelf, and (past Want to read,
// which is the reader's own choice) one book per author across the lot. Empty sections are left out.
export function starterSections(input: StarterInput): StarterSection[] {
  const shown: StarterBook[] = [];
  const authors = new Set<string>();
  const sections: StarterSection[] = [];
  for (const source of ORDER) {
    const books: StarterBook[] = [];
    for (const book of input[source]) {
      if (books.length >= STARTER_LIMITS[source]) break;
      if (shown.some((b) => sameBook(b, book))) continue;
      if (source !== "wantToRead") {
        if (authors.has(authorOf(book)) || input.shelf.some((s) => sameBook(s, book))) continue;
      }
      authors.add(authorOf(book));
      shown.push(book);
      books.push(book);
    }
    if (books.length > 0) sections.push({ source, ...sectionCopy(source, input.genreLabels), books });
  }
  return sections;
}

function sectionCopy(source: StarterSource, genreLabels: string[]): { heading: string; blurb: string } {
  switch (source) {
    case "wantToRead":
      return { heading: "From your Want to read", blurb: "You saved these already. Start one and it moves to Reading." };
    case "friends":
      return { heading: "Loved by people you follow", blurb: "Rated 4 stars or more, or put on one of their lists." };
    case "team":
      return { heading: "Bookmark team picks", blurb: "From the lists the Bookmark team puts together." };
    case "genres":
      return {
        heading: "Popular in the genres you picked",
        blurb: genreLabels.length ? `What readers shelve most in ${joinLabels(genreLabels)}.` : "What readers shelve most.",
      };
  }
}

// "Sam rated it 5 stars", "Sam put it on Cosy autumn reads", "On Cosy autumn reads".
export function starterWhy(pick: { name?: string | null; rating?: number | null; listTitle?: string | null }): string | null {
  if (pick.name && pick.rating) return `${pick.name} rated it ${pick.rating} ${pick.rating === 1 ? "star" : "stars"}`;
  if (pick.name && pick.listTitle) return `${pick.name} put it on ${pick.listTitle}`;
  if (pick.listTitle) return `On ${pick.listTitle}`;
  return null;
}
