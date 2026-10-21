// Derives a Bookmark genre (one of the labels in lib/genres.ts) from Goodreads shelves, StoryGraph
// tags or Open Library subjects. Most specific first: "historical fiction" must not land on History,
// and plenty of novels carry an Open Library "History" subject, so History is near the end.
//
// Kept free of "@/" imports so scripts/test-import.ts can load it with plain Node.

const RULES: [label: string, pattern: RegExp][] = [
  ["Graphic Novels", /graphic[\s_-]*novel|comics?\b|manga/],
  ["Historical Fiction", /historical[\s_-]*(fiction|novel|romance)/],
  ["Sci-Fi", /sci[\s_-]*fi|science[\s_-]*fiction|scifi|cyberpunk|space[\s_-]*opera|dystopi/],
  ["Fantasy", /fantasy|fae\b|dragons?/],
  ["Horror", /horror|ghost[\s_-]*stor/],
  ["Romance", /romance|romantic|love[\s_-]*stor/],
  ["Mystery & Thriller", /myster|thriller|crime|detective|suspense|whodunit/],
  // After the genres above: Open Library tags plenty of fantasy and sci-fi as young adult too.
  ["Young Adult", /young[\s_-]*adult|(^|[\s_-])ya($|[\s_-])/],
  ["Poetry", /poetry|poems/],
  ["Classics", /classics?\b|classic[\s_-]*lit/],
  ["Biography & Memoir", /biograph|memoir/],
  ["Self-Help", /self[\s_-]*help|personal[\s_-]*development|productivity/],
  ["Literary Fiction", /literary[\s_-]*fiction|literary/],
  ["History", /^history$|world[\s_-]*history|(^|\s)history\s*\(|military[\s_-]*history|^history[\s_-]/],
];

// Shelves that say nothing about genre, so a reader's "to-read" never becomes a genre hint.
const IGNORED = /^(to-read|currently-reading|read|did-not-finish|dnf|paused|on-hold|favou?rites?|owned|kindle|audiobooks?|ebooks?|library)$/;

export function genreFromTags(tags: (string | null | undefined)[]): string | null {
  const clean = tags
    .map((t) => (t ?? "").trim().toLowerCase())
    .filter((t) => t && !IGNORED.test(t));
  if (clean.length === 0) return null;
  for (const [label, pattern] of RULES) {
    if (clean.some((t) => pattern.test(t))) return label;
  }
  return null;
}

// Open Library subjects are long, noisy and loosely ordered; the first couple of dozen carry the signal.
export function genreFromSubjects(subjects: string[] | undefined): string | null {
  return subjects ? genreFromTags(subjects.slice(0, 25)) : null;
}
