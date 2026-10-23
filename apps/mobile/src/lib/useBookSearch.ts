import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// Book search, as the web's useBookSearch: books already on Bookmark's shelves show almost at once, then
// Open Library's answer fills in their details and adds what's new beneath them.

export interface FoundBook {
  workKey: string | null;
  title: string;
  author: string;
  pages: number | null;
  coverUrl: string | null;
  year?: number | null;
  editionKey?: string | null;
  isbn13?: string | null;
  isbn10?: string | null;
}

const SHELVES_DELAY = 150;
const FULL_DELAY = 400;
const keyOf = (b: FoundBook) => b.workKey || `${b.title}|${b.author}`.toLowerCase();

function settle(shown: FoundBook[], full: FoundBook[], limit: number) {
  const fresh = new Map(full.map((b) => [keyOf(b), b]));
  const kept = shown.map((b) => fresh.get(keyOf(b)) ?? b);
  const keptKeys = new Set(kept.map(keyOf));
  return [...kept, ...full.filter((b) => !keptKeys.has(keyOf(b)))].slice(0, Math.max(limit, kept.length));
}

export function useBookSearch(query: string, { limit = 12, attempt = 0 }: { limit?: 6 | 12; attempt?: number } = {}) {
  const [results, setResults] = useState<FoundBook[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 3) {
      setResults([]);
      setIsSearching(false);
      setFailed(false);
      return;
    }
    let current = true;
    let fullDone = false;
    let shown: FoundBook[] = [];
    setResults([]);
    setIsSearching(true);
    setFailed(false);
    const path = `/api/books/search?q=${encodeURIComponent(q)}&limit=${limit}`;

    const shelves = setTimeout(() => {
      api.get<FoundBook[]>(`${path}&source=shelves`)
        .then((found) => {
          if (!current || fullDone || !Array.isArray(found) || found.length === 0) return;
          shown = found;
          setResults(found);
          setIsSearching(false);
        })
        .catch(() => {});
    }, SHELVES_DELAY);

    const full = setTimeout(() => {
      api.get<FoundBook[]>(path)
        .then((found) => { fullDone = true; if (current) setResults(Array.isArray(found) ? settle(shown, found, limit) : shown); })
        .catch(() => { fullDone = true; if (current && shown.length === 0) { setResults([]); setFailed(true); } })
        .finally(() => { if (current) setIsSearching(false); });
    }, FULL_DELAY);

    return () => { current = false; clearTimeout(shelves); clearTimeout(full); };
  }, [q, limit, attempt]);

  return { results, isSearching, failed };
}
