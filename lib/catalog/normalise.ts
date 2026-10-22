// Identifier clean-up for the shared catalog: ISBNs, formats, series, and the key a manual entry
// (no Open Library match) is filed under. Pure, free of "@/" imports, so tests load it with plain Node.

export type EditionFormat = "PAPERBACK" | "HARDCOVER" | "EBOOK" | "AUDIOBOOK";

const digits = (s: string) => s.replace(/[\s-]/g, "").toUpperCase().replace(/^="?|"$/g, "");

export function isValidIsbn10(isbn: string) {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (isbn[i] === "X" ? 10 : Number(isbn[i])) * (10 - i);
  return sum % 11 === 0;
}

export function isValidIsbn13(isbn: string) {
  if (!/^\d{13}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(isbn[i]) * (i % 2 ? 3 : 1);
  return sum % 10 === 0;
}

// Only for a valid ISBN-10: the 978 form, which is the same edition.
export function isbn10To13(isbn10: string): string | null {
  if (!isValidIsbn10(isbn10)) return null;
  const core = "978" + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1);
  return core + String((10 - (sum % 10)) % 10);
}

// Only for a valid 978 ISBN-13; 979 ISBNs have no ISBN-10.
export function isbn13To10(isbn13: string): string | null {
  if (!isValidIsbn13(isbn13) || !isbn13.startsWith("978")) return null;
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? "X" : String(check));
}

export interface Isbns {
  isbn13: string | null;
  isbn10: string | null;
}

// Cleans both forms and fills in the other one when the checksum allows, so a book filed by ISBN-10
// and the same book filed by its ISBN-13 land on one edition. Values that don't look like an ISBN
// are dropped; a malformed checksum is kept as given (export files do carry a few), just not converted.
export function normaliseIsbns(input: { isbn13?: string | null; isbn10?: string | null }): Isbns {
  let isbn13 = input.isbn13 ? digits(input.isbn13) : "";
  let isbn10 = input.isbn10 ? digits(input.isbn10) : "";
  // Either field may hold either form.
  if (/^\d{9}[\dX]$/.test(isbn13) && !/^\d{13}$/.test(isbn13)) [isbn13, isbn10] = [isbn10, isbn13];
  if (/^\d{13}$/.test(isbn10) && !/^\d{13}$/.test(isbn13)) [isbn13, isbn10] = [isbn10, isbn13];
  if (!/^\d{13}$/.test(isbn13)) isbn13 = "";
  if (!/^\d{9}[\dX]$/.test(isbn10)) isbn10 = "";
  if (!isbn13 && isbn10) isbn13 = isbn10To13(isbn10) ?? "";
  if (!isbn10 && isbn13) isbn10 = isbn13To10(isbn13) ?? "";
  return { isbn13: isbn13 || null, isbn10: isbn10 || null };
}

// "/books/OL7353617M" -> "OL7353617M"; anything else becomes null.
export function normaliseEditionKey(key?: string | null) {
  const match = key?.match(/OL\d+M/);
  return match ? match[0] : null;
}

// Goodreads "Binding", StoryGraph "Format" and Open Library "physical_format" all say the same few
// things in different words. Anything unrecognised ("Unknown Binding", "Board book") is left unset.
export function formatFrom(raw?: string | null): EditionFormat | null {
  const s = (raw ?? "").toLowerCase();
  if (!s) return null;
  if (/audio|audible|mp3|cd\b/.test(s)) return "AUDIOBOOK";
  if (/kindle|e-?book|digital|nook|electronic|epub|pdf/.test(s)) return "EBOOK";
  if (/hardcover|hardback|hard cover|library binding|cloth/.test(s)) return "HARDCOVER";
  if (/paperback|softcover|soft cover|mass market|trade paper/.test(s)) return "PAPERBACK";
  return null;
}

export interface Series {
  name: string;
  position: number | null;
}

// Goodreads titles carry the series: "Words of Radiance (The Stormlight Archive, #2)". Open Library
// editions list it as "The Stormlight Archive ;; 2" or "Dune #1".
export function seriesFromTitle(title: string): Series | null {
  const m = title.match(/\(([^()]*?)(?:,)?\s*#\s*([\d.]+)(?:-[\d.]+)?\)\s*$/);
  if (!m) return null;
  const name = m[1].trim().replace(/,$/, "").trim();
  if (!name) return null;
  const position = Number(m[2]);
  return { name, position: Number.isFinite(position) ? position : null };
}

export function seriesFromOpenLibrary(entries?: string[] | null): Series | null {
  for (const raw of entries ?? []) {
    const m = raw.match(/^(.*?)(?:\s*;;\s*|\s*,?\s*#|\s+(?:book|vol\.?|volume)\s+)([\d.]+)\s*$/i);
    if (m && m[1].trim()) return { name: m[1].trim(), position: Number(m[2]) };
    if (raw.trim()) return { name: raw.trim(), position: null };
  }
  return null;
}

// Same normalisation as lib/workKey.ts's sameBook(), so a manual entry is filed where that rule would
// look for it: "The  Hobbit" by "Tolkien, J.R.R." and "the hobbit" by "tolkien jrr" share one work.
const squash = (s?: string | null) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

export function titleAuthorKey(title: string, author?: string | null) {
  return `${squash(title)}|${squash(author)}`;
}

// "1965", "Jun 2, 1990", "2019-08" -> the year.
export function yearFrom(raw?: string | number | null): number | null {
  if (typeof raw === "number") return Number.isInteger(raw) && raw > 0 && raw < 3000 ? raw : null;
  const m = (raw ?? "").match(/\b(1[5-9]\d\d|20\d\d)\b/);
  return m ? Number(m[1]) : null;
}
