// Filtering /notes (BOO-13): find a thought in the reader's own notes by the words they remember.
//
// Plain word matching, not AI: nothing here leaves the database or reaches a model. The caller passes
// only the signed-in reader's own notes, so this can't surface anyone else's. Free, like the notes
// themselves (docs/audit/tier-audit-2026-10.md). Meaning-based search would be a separate, opt-in layer.

export const NOTE_QUERY_MAX = 200;
export const NOTE_RESULTS_MAX = 30;
// Notes per page on /notes, filtered or not.
export const NOTE_PAGE_SIZE = 30;
const SNIPPET_RADIUS = 90;

// Words too common to say anything about a note. "the quote about grief" searches for "quote" and "grief".
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "had", "has", "have", "i", "in", "is", "it", "its",
  "me", "my", "of", "on", "or", "so", "that", "the", "this", "to", "was", "were", "with", "about", "book", "read",
]);

export interface SearchableNote {
  id: string;
  bookId: string;
  title: string | null;
  content: string;
  createdAt: Date;
}

export interface NoteMatch {
  note: SearchableNote;
  score: number;
  // The note text around the first match, with ellipses where it was cut.
  snippet: string;
  // Words (as the reader typed them) that were found, for highlighting.
  matched: string[];
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function queryTerms(query: string): string[] {
  const words = query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .match(/[a-z0-9']+/g) ?? [];
  const kept = words.map((w) => w.replace(/^'+|'+$/g, "")).filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return Array.from(new Set(kept));
}

const fold = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

// A term matches at the start of a word, so "griev" finds "grieving" but "rie" doesn't find "grief".
const wordStart = (term: string) => new RegExp(`(^|[^a-z0-9])${escape(term)}`, "i");

function snippetAround(content: string, index: number): string {
  if (content.length <= SNIPPET_RADIUS * 2) return content;
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(content.length, index + SNIPPET_RADIUS);
  return `${start > 0 ? "…" : ""}${content.slice(start, end).trim()}${end < content.length ? "…" : ""}`;
}

// Notes that contain every word score highest; a note missing a word still shows if it has most of
// them, below the full matches. Ties go to the newer note.
export function searchNotes(notes: SearchableNote[], query: string, limit = NOTE_RESULTS_MAX): NoteMatch[] {
  const terms = queryTerms(query.slice(0, NOTE_QUERY_MAX));
  if (terms.length === 0) return [];
  const phrase = fold(query.trim().slice(0, NOTE_QUERY_MAX)).replace(/\s+/g, " ");
  const patterns = terms.map((term) => ({ term, regex: wordStart(term) }));
  const needed = terms.length <= 2 ? terms.length : Math.ceil(terms.length * 0.6);

  const matches: NoteMatch[] = [];
  for (const note of notes) {
    const body = fold(note.content);
    const title = fold(note.title ?? "");
    const found = patterns.filter(({ regex }) => regex.test(body) || regex.test(title));
    if (found.length < needed) continue;

    let score = found.length * 10;
    if (found.length === terms.length) score += 20;
    if (phrase.includes(" ") && body.includes(phrase)) score += 25;
    for (const { regex } of found) if (regex.test(title)) score += 3;

    const first = Math.min(...found.map(({ regex }) => {
      const at = body.search(regex);
      return at < 0 ? Number.MAX_SAFE_INTEGER : at;
    }));
    matches.push({
      note,
      score,
      snippet: snippetAround(note.content, first === Number.MAX_SAFE_INTEGER ? 0 : first),
      matched: found.map(({ term }) => term),
    });
  }

  return matches
    .sort((a, b) => b.score - a.score || b.note.createdAt.getTime() - a.note.createdAt.getTime())
    .slice(0, limit);
}
