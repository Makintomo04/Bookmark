// The reader's own tags on their books (Book.tags): "owned", "kindle", "book-club-2023". Private, free-form
// and short. Kept free of "@/" imports so the import code and its tests can use it under plain Node.

export const TAG_MAX_LENGTH = 40;
export const TAGS_PER_BOOK = 30;

// One tag as stored: trimmed, inner spaces collapsed, at most TAG_MAX_LENGTH. The reader's casing stays.
export function cleanTag(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, TAG_MAX_LENGTH).trim();
}

// A book's tags: cleaned, empty ones dropped, duplicates (ignoring case) dropped, capped.
export function cleanTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const tag = cleanTag(r);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= TAGS_PER_BOOK) break;
  }
  return out;
}

// Goodreads shelves that are really statuses or Bookmark features, not the reader's own filing: the three
// exclusive shelves, and whatever import already turns into DNF, Paused or a favourite.
const NOT_TAGS = /^(read|to-read|currently-reading|want-to-read|reading|did-not-finish|dnf|paused|on-hold|favou?rites?|favs?)$/i;

// Shelves or tags from an import, as Bookmark tags. `special` are the patterns the importer already reads
// for status and favourites (lib/import/formats.ts), so a "dnf" shelf isn't kept as a tag as well.
export function tagsFromShelves(shelves: readonly string[], special: readonly RegExp[] = []): string[] {
  return cleanTags(shelves.filter((s) => {
    const name = s.trim();
    return name && !NOT_TAGS.test(name) && !special.some((re) => re.test(name));
  }));
}
