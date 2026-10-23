import type { EditionFormat } from "../catalog/normalise.ts";
import { formatFrom } from "../catalog/normalise.ts";
import { type FileNotes, emptyNotes } from "./types.ts";

// The pre-cleaner: what a real Goodreads or StoryGraph export needs before it can be parsed.
//
//   - a BOM, Windows line endings, and NULs from a UTF-16 round trip through a spreadsheet;
//   - stray quotes inside quoted fields (`"The "Great" Gatsby"`) and an unterminated quote, either of
//     which would otherwise swallow every row after it;
//   - the `="0441013597"` formula guard Goodreads wraps ISBNs in (and `=""` for none);
//   - dates in whatever shape the file arrived: YYYY/MM/DD, YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY,
//     "Mar 14, 2024", ISO timestamps, blanks. Everything readable becomes YYYY/MM/DD for lib/import/formats.ts;
//     anything unreadable becomes blank and is counted, never guessed;
//   - audiobook and ebook formats from the binding, or from an "audiobook"/"kindle" shelf when the binding doesn't say.
//
// Kept free of "@/" imports so scripts/test/*.test.ts can load it with plain Node.

// ---- Text ----------------------------------------------------------------------------------

export function cleanCsvText(raw: string): string {
  let text = raw;
  // A UTF-8 BOM (and the mojibake one a double-encoded file carries), NULs from UTF-16, and leading blank lines.
  text = text.replace(/^﻿+/, "").replace(/^ï»¿/, "").replace(/\u0000/g, "");
  text = text.replace(/^(?:[ \t]*\r?\n)+/, "");
  return repairQuotes(text);
}

// Walks the text as the CSV parser will. A quote inside a quoted field that isn't doubled and isn't
// followed by a separator is escaped; a quoted field left open at the end of the file loses its
// opening quote and the text is walked again, so one stray quote can't swallow the rest of the rows.
export function repairQuotes(text: string): string {
  let out = "";
  let i = 0;
  let inQuotes = false;
  let fieldStart = true;
  let openedAt = -1;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          out += '""';
          i += 2;
          continue;
        }
        if (i + 1 === text.length || /^[ \t]*(?:,|\r|\n|$)/.test(text.slice(i + 1, i + 64))) {
          inQuotes = false;
          out += '"';
          i++;
          fieldStart = false;
          continue;
        }
        out += '""';
        i++;
        continue;
      }
      out += ch;
      i++;
      continue;
    }
    if (ch === '"' && fieldStart) {
      inQuotes = true;
      openedAt = i;
      out += ch;
      i++;
      fieldStart = false;
    } else if (ch === "," || ch === "\r" || ch === "\n") {
      out += ch;
      i++;
      fieldStart = true;
    } else {
      out += ch;
      i++;
      fieldStart = false;
    }
  }
  if (inQuotes && openedAt >= 0) return repairQuotes(text.slice(0, openedAt) + text.slice(openedAt + 1));
  return out;
}

// ---- Cells ---------------------------------------------------------------------------------

// `="0441013597"` → `0441013597`; `=""` → ``. Also the half-stripped forms a spreadsheet leaves behind.
export function unguard(value: string | undefined): string {
  const s = (value ?? "").trim();
  const m = s.match(/^=\s*"?(.*?)"?\s*$/);
  return (m ? m[1] : s).replace(/^"+|"+$/g, "").trim();
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const monthNumber = (name: string) => {
  const s = name.toLowerCase();
  return MONTHS[s.slice(0, 4)] ?? MONTHS[s.slice(0, 3)] ?? null;
};

const pad = (n: number) => String(n).padStart(2, "0");
// Only a date that exists: 31/02/2024 is not a day, and must not quietly become 2 March.
const ymd = (y: number, m: number, d: number) => {
  if (y < 1000 || y > 2999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}/${pad(m)}/${pad(d)}` : null;
};

// One date-like token, in any of the shapes exports and spreadsheets produce. Order matters: a
// year-first token must not be read as day-first.
const DATE_TOKEN = new RegExp(
  [
    // 1-3: Y M D, with an optional time (an ISO timestamp from a spreadsheet)
    String.raw`\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b`,
    // 4-6: a b Y (day and month in either order)
    String.raw`\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b`,
    // 7-9: Mon D, Y
    String.raw`\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b`,
    // 10-12: D Mon Y
    String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b`,
  ].join("|"),
  "g",
);

// Tokens of the ambiguous "a/b/YYYY" shape, for deciding the file's day order.
const NUMERIC_DMY = /\b(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}\b/g;

export interface DateOrder {
  dayFirst: boolean;
  guessed: boolean;
}

// Looks at every a/b/YYYY date in the file: a first part over 12 means day-first, a second part over
// 12 means month-first. With no evidence either way, day-first is assumed, and the preview says so.
// Null when the file has no such dates.
export function inferDateOrder(cells: string[]): DateOrder | null {
  let dayFirst = 0;
  let monthFirst = 0;
  let seen = 0;
  for (const cell of cells) {
    for (const m of Array.from(cell.matchAll(NUMERIC_DMY))) {
      seen++;
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a > 12 && b <= 12) dayFirst++;
      else if (b > 12 && a <= 12) monthFirst++;
    }
  }
  if (seen === 0) return null;
  if (dayFirst === 0 && monthFirst === 0) return { dayFirst: true, guessed: true };
  return { dayFirst: dayFirst >= monthFirst, guessed: dayFirst > 0 && monthFirst > 0 };
}

// Rewrites every date token in a cell as YYYY/MM/DD. Tokens that can't be a date are left as they were.
export function normaliseDates(cell: string, order: DateOrder | null): string {
  return cell.replace(DATE_TOKEN, (whole: string, ...groups: (string | undefined)[]) => {
    const [y1, m1, d1, a, b, y2, mon1, d2, y3, d3, mon2, y4] = groups;
    if (y1) return ymd(Number(y1), Number(m1), Number(d1)) ?? whole;
    if (y2) {
      const [p, q] = [Number(a), Number(b)];
      const dayFirst = order?.dayFirst ?? true;
      // The token itself can settle it when one part can only be a day.
      const [d, m] = p > 12 ? [p, q] : q > 12 ? [q, p] : dayFirst ? [p, q] : [q, p];
      return ymd(Number(y2), m, d) ?? whole;
    }
    if (y3 && mon1) {
      const m = monthNumber(mon1);
      return m ? ymd(Number(y3), m, Number(d2)) ?? whole : whole;
    }
    if (y4 && mon2) {
      const m = monthNumber(mon2);
      return m ? ymd(Number(y4), m, Number(d3)) ?? whole : whole;
    }
    return whole;
  });
}

// A single-date cell after normalisation: blank, a year, a year and month, or a full date.
const CLEAN_DATE = /^(?:\d{4}(?:\/\d{2}(?:\/\d{2})?)?)?$/;

const isDateColumn = (header: string) => /date/i.test(header);
const isRangeColumn = (header: string) => /dates read/i.test(header);
const isIsbnColumn = (header: string) => /isbn/i.test(header);

const UNREADABLE_LISTED = 8;

// Cleans every record in place for the mappers in lib/import/formats.ts, and reports what it had to do.
export function cleanRecords(headers: string[], records: Record<string, string>[]): FileNotes {
  const notes = emptyNotes();
  const dateColumns = headers.filter(isDateColumn);
  const isbnColumns = headers.filter(isIsbnColumn);

  const order = inferDateOrder(records.flatMap((r) => dateColumns.map((h) => r[h] ?? "")));
  notes.dayFirst = order?.dayFirst ?? null;
  notes.dateOrderGuessed = order?.guessed ?? false;

  records.forEach((record, i) => {
    for (const h of isbnColumns) record[h] = unguard(record[h]);
    for (const h of dateColumns) {
      const raw = (record[h] ?? "").trim();
      if (!raw) {
        record[h] = "";
        continue;
      }
      const clean = normaliseDates(raw, order);
      if (isRangeColumn(h) || CLEAN_DATE.test(clean)) {
        record[h] = clean;
      } else {
        // Not a date we can read. Blank, so nothing downstream guesses one; the preview says so.
        record[h] = "";
        notes.unreadableDateCount++;
        if (notes.unreadableDates.length < UNREADABLE_LISTED) notes.unreadableDates.push({ line: i + 1, column: h, value: raw.slice(0, 40) });
      }
    }
  });
  return notes;
}

// ---- Formats -------------------------------------------------------------------------------

const AUDIO_TAG = /^(audio|audiobooks?|audible|listened(-to)?|on-audio|audio-?books?)$/i;
const EBOOK_TAG = /^(kindle|e-?books?|digital|nook|kobo|e-?reader)$/i;

// The binding first (Goodreads "Binding", StoryGraph "Format"); failing that, a shelf or tag that says
// how the book was read. Goodreads often exports "Unknown Binding" or "Paperback" for a book a reader
// listened to, and the "audiobook" shelf is the only place the format survives.
export function detectFormat(binding: string | undefined, tags: string[]): EditionFormat | null {
  const fromBinding = formatFrom(binding);
  if (fromBinding) return fromBinding;
  if (tags.some((t) => AUDIO_TAG.test(t.trim()))) return "AUDIOBOOK";
  if (tags.some((t) => EBOOK_TAG.test(t.trim()))) return "EBOOK";
  return null;
}
