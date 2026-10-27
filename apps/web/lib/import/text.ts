import type { Status } from "@prisma/client";
import { AI_MODELS, aiAvailable, askJson } from "../ai/client.ts";
import { emptyNotes, type ImportRow, type ParsedImport } from "./types.ts";

// Reads a pasted list (a notes app, a .txt or .md file) into import rows. The CSV mappers in formats.ts
// need known columns; a list has none, so each line is read on its own:
//
//   - Rules first: bullets, numbering, checkboxes, star ratings, "Title by Author", "Title - Author",
//     "Title (Author)", and headings ("Read 2024:", "## TBR") that set the shelf for the lines under them.
//   - With ANTHROPIC_API_KEY set, Claude Haiku 5.5 reads the lines in batches instead, which is far better
//     at telling a book from a note to self ("ask Sam for the sequel"). It only copies text out: every
//     title it returns must appear in that line, or the line is dropped. An author that isn't in the
//     line is dropped too. Which book a row is gets decided by the Open Library search, as for a CSV.
//   - A batch the model fails on falls back to the rules, so a request error never loses lines.
//
// Kept free of "@/" imports so scripts/test/import-text.test.ts runs it under plain Node. The model call
// is injectable (`ask`) for the same reason.

export const MAX_LIST_LINES = 2_000;
// Lines per request. Small enough that 25 requests run side by side inside the upload's time limit.
export const LINES_PER_CALL = 80;
// A line longer than this is prose, not a book; the model sees the start of it.
const MAX_LINE_CHARS = 300;
const CALL_TIMEOUT_MS = 20_000;

export type ListShelf = "read" | "reading" | "want" | "dnf" | "paused";

const SHELF_STATUS: Record<ListShelf, Status> = {
  read: "COMPLETED",
  reading: "STARTED",
  want: "NOT_STARTED",
  dnf: "DNF",
  paused: "PAUSED",
};

export interface ListLine {
  // 1-based line number in the pasted text.
  n: number;
  text: string;
}

// What a line turned out to be. Lines that are neither (blank, notes, prose) have no entry.
export type LineReading =
  | { n: number; kind: "book"; title: string; author: string | null; shelf: ListShelf | null }
  | { n: number; kind: "heading"; shelf: ListShelf | null };

export class ListInputError extends Error {}

// ---- Lines -------------------------------------------------------------------------------

export function listLines(text: string): ListLine[] {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\u0000/g, "")
    .split(/\r\n?|\n|\u2028/)
    .map((line, i) => ({ n: i + 1, text: line.trim().slice(0, MAX_LINE_CHARS) }))
    .filter((line) => /\p{L}|\d{2}/u.test(line.text));
}

// Words, or a title that is all digits ("1984", "11/22/63"). Not a stray "12." or "5/5".
const looksLikeTitle = (s: string) => /\p{L}/u.test(s) || (/^\d[\d/.,:\s]*\d$/.test(s.trim()) && s.replace(/\D/g, "").length >= 4);

// Lower case, no accents, letters and digits only, single spaces: what "appears in the line" compares.
export const fold = (s: string) =>
  s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// The model's title (or author) is only kept when it is in the line as the reader wrote it.
export const grounded = (value: string, line: string) => {
  const v = fold(value);
  return v.length > 0 && ` ${fold(line)} `.includes(` ${v} `);
};

// ---- Rules -------------------------------------------------------------------------------

const DONE_MARK = /^(?:[-*+]\s*)?(?:\[[xX✓✔]\]|[✅☑✔✓]\uFE0F?)\s*/u;
const OPEN_MARK = /^(?:[-*+]\s*)?(?:\[\s\]|[☐⬜□]\uFE0F?)\s*/u;
const BULLET = /^(?:[-*+•·▪◦‣>→]|[–—](?=\s))\s*/u;
// "1. ", "12) ", "(3) ", "4 - ". Not "1984" or "11/22/63": numbering needs its punctuation and a space.
const NUMBERING = /^\(?\d{1,4}[.)\]:]\s+|^\d{1,4}\s+[-–—]\s+/u;
const RATING = /\s*[-–—(|,]?\s*(?:\d(?:\.\d+)?\s*(?:\/\s*(?:5|10)|stars?|⭐\uFE0F?)|[⭐★☆]{1,5}|\d(?:\.\d+)?\s*⭐)\s*\)?\s*$/iu;
const TRAILING_EMOJI = /[\s\p{Extended_Pictographic}\uFE0F\u200D]+$/u;

export function shelfFromWords(text: string): ListShelf | null {
  const s = fold(text);
  if (/\b(dnf|did not finish|didnt finish|abandoned|gave up)\b/.test(s)) return "dnf";
  if (/\b(paused|on hold)\b/.test(s)) return "paused";
  if (/\b(tbr|to read|want to read|reading list|wishlist|wish list|to buy|up next|next|someday|recommended|recommendations)\b/.test(s)) return "want";
  if (/\b(currently reading|reading now|in progress|now reading|reading)\b/.test(s)) return "reading";
  if (/\b(read|finished|completed|done)\b/.test(s) || /\b(19|20)\d\d\b/.test(s)) return "read";
  return null;
}

// A heading is a markdown heading, a short line ending in a colon, or a line that is only a shelf name.
function headingOf(text: string): LineReading | null {
  const bare = text.replace(/^#+\s*/, "").replace(/[:：]\s*$/, "").replace(TRAILING_EMOJI, "").trim();
  const words = bare.split(/\s+/).length;
  const shelf = shelfFromWords(bare);
  if (/^#+\s/.test(text) || (/[:：]\s*$/.test(text) && words <= 6)) return { n: 0, kind: "heading", shelf };
  const shelfOnly = /^(?:(?:books?\s+)?(?:i'?ve\s+|i\s+)?(?:read|finished|completed|reading|currently reading|to read|tbr|want to read|dnf|did not finish|wishlist|up next|paused|on hold)(?:\s+(?:in\s+)?(?:19|20)\d\d)?|(?:19|20)\d\d)$/i;
  if (shelfOnly.test(bare)) return { n: 0, kind: "heading", shelf };
  // A title over the whole list: "Books", "My book list", "Reading list".
  if (/^(?:my\s+)?(?:books?|book\s+list|reading\s+list|books\s+to\s+read|list)$/i.test(bare)) return { n: 0, kind: "heading", shelf };
  return null;
}

// Splits what's left of a book line into title and author, when the line says which is which.
export function splitTitleAuthor(text: string): { title: string; author: string | null } {
  const by = text.match(/^(.+?)\s+by\s+([^,;()]+?)\s*$/i);
  if (by) return { title: by[1].trim(), author: by[2].trim() };
  const dash = text.match(/^(.+?)\s+[-–—|]\s+(.+)$/);
  if (dash) return { title: dash[1].trim(), author: dash[2].trim() };
  // "Title (Author)", but not "Title (Series, #2)" or "(2019)".
  const paren = text.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (paren && !/#|\d/.test(paren[2])) return { title: paren[1].trim(), author: paren[2].trim() };
  return { title: text.trim(), author: null };
}

// One line by the rules alone.
export function readLineByRules(line: ListLine): LineReading | null {
  let text = line.text;
  const heading = headingOf(text);
  if (heading) return { ...heading, n: line.n };

  let shelf: ListShelf | null = null;
  if (DONE_MARK.test(text)) {
    shelf = "read";
    text = text.replace(DONE_MARK, "");
  } else if (OPEN_MARK.test(text)) {
    text = text.replace(OPEN_MARK, "");
  }
  text = text.replace(BULLET, "").replace(NUMBERING, "");
  // Markdown strikethrough is how a lot of lists tick a book off.
  const struck = text.match(/^~~(.+)~~$/);
  if (struck) {
    text = struck[1];
    shelf ??= "read";
  }
  // A shelf word in brackets at the end: "Fourth Wing (DNF)", "Babel [reading]".
  const tag = text.match(/\s*[([]\s*([^()[\]]{2,24})\s*[)\]]\s*$/);
  const tagShelf = tag ? shelfFromWords(tag[1]) : null;
  if (tag && tagShelf) {
    shelf = tagShelf;
    text = text.slice(0, tag.index).trim();
  }
  text = text.replace(RATING, "").replace(TRAILING_EMOJI, "").replace(/\*\*|__|`/g, "").trim();

  // Prose, questions and links are notes, not books.
  if (!looksLikeTitle(text) || text.split(/\s+/).length > 14 || /\?\s*$/.test(text) || /https?:\/\//i.test(text)) return null;
  const { title, author } = splitTitleAuthor(text);
  if (!looksLikeTitle(title)) return null;
  return { n: line.n, kind: "book", title, author, shelf };
}

// ---- The model ---------------------------------------------------------------------------

const SYSTEM = `You read a reader's own list of books, pasted from a notes app, and say which lines are books.

You get numbered lines. For each line that names a book, return its number, the title and the author exactly as written in that line, and the shelf if the line itself marks one (a tick or checkbox, "DNF", "reading", "finished", strikethrough). For each line that is a heading over a group of books ("Read in 2024", "TBR", "Fantasy"), return it as a heading, with the shelf it implies or null.

Rules:
- Copy the title and author from the line, character for character, minus bullets, numbering, ratings, emoji and notes. Never correct, complete, expand or translate them, and never add an author that isn't written in the line.
- A line can be "Author - Title" or "Title - Author": use what you know of books to tell which part is the title.
- Leave out lines that aren't books or headings: notes to self, shopping reminders, quotes, prose, links.
- shelf: "read", "reading", "want", "dnf", "paused" or "none". Only when the line or heading says so; never guess from the book.
- Answer in the order given.`;

export const LINES_SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer", description: "The line's number, as given." },
          kind: { type: "string", enum: ["book", "heading"] },
          title: { type: ["string", "null"] },
          author: { type: ["string", "null"] },
          // "none" rather than null: structured outputs reject an enum on a nullable type.
          shelf: { type: "string", enum: ["read", "reading", "want", "dnf", "paused", "none"] },
        },
        required: ["n", "kind", "title", "author", "shelf"],
        additionalProperties: false,
      },
    },
  },
  required: ["lines"],
  additionalProperties: false,
} as const;

export const promptForLines = (lines: ListLine[]) => lines.map((l) => `${l.n}: ${l.text}`).join("\n");

const SHELVES = new Set<string>(["read", "reading", "want", "dnf", "paused"]);

// Keeps only well-formed answers about lines that were asked about, and only titles found in their line.
export function readLines(raw: unknown, lines: ListLine[]): LineReading[] {
  const byN = new Map(lines.map((l) => [l.n, l]));
  const list = Array.isArray((raw as { lines?: unknown })?.lines) ? (raw as { lines: unknown[] }).lines : [];
  const out: LineReading[] = [];
  const seen = new Set<number>();
  for (const item of list) {
    const r = item as { n?: unknown; kind?: unknown; title?: unknown; author?: unknown; shelf?: unknown };
    const line = typeof r.n === "number" ? byN.get(r.n) : undefined;
    if (!line || seen.has(line.n)) continue;
    const shelf = typeof r.shelf === "string" && SHELVES.has(r.shelf) ? (r.shelf as ListShelf) : null;
    if (r.kind === "heading") {
      seen.add(line.n);
      out.push({ n: line.n, kind: "heading", shelf });
      continue;
    }
    if (r.kind !== "book" || typeof r.title !== "string") continue;
    const title = r.title.trim();
    if (!title || !grounded(title, line.text)) continue;
    const author = typeof r.author === "string" && r.author.trim() && grounded(r.author, line.text) ? r.author.trim() : null;
    seen.add(line.n);
    out.push({ n: line.n, kind: "book", title, author, shelf });
  }
  return out;
}

export type AskLinesFn = (lines: ListLine[]) => Promise<LineReading[]>;

export const askClaudeForLines: AskLinesFn = async (lines) => {
  const { data } = await askJson({
    model: AI_MODELS.fast,
    maxTokens: 6000,
    // Copying text out of lines: no thinking, a schema the answer must fit.
    thinking: false,
    effort: "low",
    schema: LINES_SCHEMA as unknown as Record<string, unknown>,
    system: SYSTEM,
    prompt: promptForLines(lines),
    timeoutMs: CALL_TIMEOUT_MS,
  });
  return readLines(data, lines);
};

// ---- Entry point -------------------------------------------------------------------------

export interface ReadListOptions {
  // The shelf for books whose line and heading don't say. Want to read unless the reader picks another.
  defaultStatus?: Status;
  // Null: rules only. Undefined: the model when a key is set.
  ask?: AskLinesFn | null;
}

export interface ReadListResult extends ParsedImport {
  // How the lines were read: by the model, by the rules, or both (a batch the model failed on).
  readBy: "model" | "rules" | "mixed";
}

const listRow = (n: number, title: string, author: string | null, status: Status): ImportRow => ({
  line: n,
  title,
  author: author || "Unknown",
  status,
  isbn13: null,
  isbn10: null,
  format: null,
  publisher: null,
  publishedYear: null,
  series: null,
  rating: null,
  pages: null,
  currentPage: null,
  review: null,
  privateNotes: null,
  genre: null,
  favourite: false,
  addedAt: null,
  startedAt: null,
  completedAt: null,
  stoppedAt: null,
  // A book marked read has one undated read, as a Goodreads row with no dates does.
  completedReads: status === "COMPLETED" ? [{ startedAt: null, finishedAt: null }] : [],
  workKey: null,
  coverUrl: null,
});

export async function readList(text: string, opts: ReadListOptions = {}): Promise<ReadListResult> {
  const lines = listLines(text);
  if (lines.length === 0) throw new ListInputError("There's no list there. Paste the books one per line.");
  if (lines.length > MAX_LIST_LINES) {
    throw new ListInputError(
      `That list has ${lines.length.toLocaleString("en-GB")} lines; the limit is ${MAX_LIST_LINES.toLocaleString("en-GB")} per import. Split it in two.`,
    );
  }
  const ask = opts.ask === undefined ? (aiAvailable() ? askClaudeForLines : null) : opts.ask;

  const batches: ListLine[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_CALL) batches.push(lines.slice(i, i + LINES_PER_CALL));

  // Every batch at once: 25 at most, each a few seconds.
  const batchReads = await Promise.all(
    batches.map(async (batch): Promise<{ by: "model" | "rules"; read: LineReading[] }> => {
      if (ask) {
        try {
          return { by: "model", read: await ask(batch) };
        } catch (err) {
          console.warn("import: reading a list batch with the model failed, using the rules:", err instanceof Error ? err.message : err);
        }
      }
      return { by: "rules", read: batch.map(readLineByRules).filter((r): r is LineReading => !!r) };
    }),
  );
  const usedModel = batchReads.some((b) => b.by === "model");
  const usedRules = batchReads.some((b) => b.by === "rules");

  // Headings carry over between batches, so the shelves are worked out in line order once all are back.
  const byLine = batchReads.flatMap((b) => b.read).sort((a, b) => a.n - b.n);
  const fallback = opts.defaultStatus ?? "NOT_STARTED";
  let section: ListShelf | null = null;
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  for (const reading of byLine) {
    if (reading.kind === "heading") {
      // A heading with no shelf in it ("Fantasy") keeps the shelf of the section it sits in.
      if (reading.shelf) section = reading.shelf;
      continue;
    }
    // The same book twice in a list is one book (the duplicate check would skip it anyway, with a note).
    const key = `${fold(reading.title)}|${fold(reading.author ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const shelf = reading.shelf ?? section;
    rows.push(listRow(reading.n, reading.title, reading.author, shelf ? SHELF_STATUS[shelf] : fallback));
  }

  return {
    source: "list",
    rows,
    skippedLines: [],
    notes: emptyNotes(),
    readBy: usedModel && usedRules ? "mixed" : usedModel ? "model" : "rules",
  };
}
