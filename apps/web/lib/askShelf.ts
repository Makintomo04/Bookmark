import { MOODS, MOOD_LABEL, WARNING_TOPICS, shownMoods, type Mood, type MoodCount, type WarningSummary, type WarningTopic } from "@/lib/workTags";
import { AiError, type AskJson } from "@/lib/ai/client";

// Ask the shelf: a reader describes what they're in the mood for, and gets books from Bookmark's own
// catalog. The model never names a title. It does two jobs the reader asked for, both labelled:
//
//   1. Turn the reader's words into a structured intent (moods from the fixed set, pace, genres and
//      themes, must-haves, content warnings to avoid, length, format, re-reads). One call.
//   2. Write one short, book-only reason for each result it's handed. One call. Never about the reader.
//
// Between them, plain code does the finding: works in the catalog are filtered and scored against the
// intent (subjects, description, title, readers' mood tags), the reader's own shelf is left out unless
// they asked for re-reads, works carrying a warning they ruled out are dropped, and what's left is
// ranked friends first: books rated 4+ by people they follow, then books finished in their reading
// circles, then everything else. Each result says which of those it is.
//
// Everything the pipeline touches is passed in (AskShelfDeps), so scripts/test/askShelf.test.ts runs
// it with a fake model and an in-memory catalog. The Prisma side is lib/askShelfCatalog.ts.

export const ASK_QUERY_MAX = 300;
export const ASK_RESULTS_MAX = 10;
// Reasons longer than this are cut at a word boundary.
export const REASON_MAX = 220;

export const PACES = ["slow", "medium", "fast"] as const;
export type Pace = typeof PACES[number];
export const FORMATS = ["print", "ebook", "audiobook"] as const;
export type AskFormat = typeof FORMATS[number];

export interface ShelfIntent {
  moods: Mood[];
  avoidMoods: Mood[];
  pace: Pace | null;
  // Lower case: "romantasy", "fantasy", "romance".
  genres: string[];
  // Themes and tropes as a library subject heading or a blurb would put them: "dragons", "found family".
  subjects: string[];
  // Things the reader insisted on, in their words: "strong female lead", "happy ending".
  mustHaves: string[];
  // Content warnings the reader ruled out, from the fixed list in lib/workTags.ts.
  mustNotHaves: WarningTopic[];
  // Themes the reader ruled out that aren't content warnings: "love triangle".
  avoidSubjects: string[];
  minPages: number | null;
  maxPages: number | null;
  format: AskFormat | null;
  rereads: boolean;
}

export const emptyIntent = (): ShelfIntent => ({
  moods: [], avoidMoods: [], pace: null, genres: [], subjects: [], mustHaves: [], mustNotHaves: [], avoidSubjects: [],
  minPages: null, maxPages: null, format: null, rereads: false,
});

// ---- Step 1: the reader's words → intent -------------------------------------------------------------

const INTENT_SYSTEM = `You turn a reader's description of the book they want next into a structured search. A separate system searches a book catalog with your answer.

Rules:
- Never name a book, series or author in any field. If the reader says "like <some book>", describe that book's traits instead (its genre, themes, tone, pace).
- moods: only from the given list, at most 4, the ones the reader's words clearly point to. "cosy", "comforting" or "low-stakes" read as lighthearted and hopeful; "a good cry" as emotional; "creepy" as dark and tense; "page-turner" as tense.
- avoidMoods: moods the reader wants to stay away from ("nothing too heavy" → dark, challenging).
- pace: slow, medium or fast if they said or clearly implied it, else "any".
- genres: lower-case genre names the reader asked for (romantasy, fantasy, romance, science fiction, mystery, thriller, horror, historical fiction, literary fiction, young adult, contemporary). Empty when they didn't name or clearly imply one.
- subjects: up to 10 lower-case words or short phrases as a library subject heading or a back-cover blurb would put the themes and tropes they want, including near synonyms ("strong female lead" → "women heroes", "heroines", "female protagonist"; "enemies to lovers" → "enemies to lovers", "rivals").
- mustHaves: the things they insisted on, in short plain words, at most 6.
- mustNotHaves: content warnings they ruled out, only from the given list. Map their words onto it: "no sexual violence" → Sexual assault; "nothing spicy" or "closed door" → Sexual content; "no animal deaths" → Animal death; "no cheating" → Infidelity.
- avoidSubjects: themes they ruled out that aren't on the warnings list ("no love triangles" → "love triangle").
- minPages / maxPages: numbers only when they gave a length ("under 400 pages" → max 400; "a short read" → max 300; "a chunky epic" → min 500). Otherwise null.
- format: print, ebook or audiobook if they asked for one, else "any".
- rereads: true only if they asked for something they've read before.
- If the text isn't a request for a book, return every list empty and every other field at its default.`;

export const INTENT_SCHEMA = {
  type: "object",
  properties: {
    moods: { type: "array", items: { type: "string", enum: [...MOODS] } },
    avoidMoods: { type: "array", items: { type: "string", enum: [...MOODS] } },
    pace: { type: "string", enum: [...PACES, "any"] },
    genres: { type: "array", items: { type: "string" } },
    subjects: { type: "array", items: { type: "string" } },
    mustHaves: { type: "array", items: { type: "string" } },
    mustNotHaves: { type: "array", items: { type: "string", enum: [...WARNING_TOPICS] } },
    avoidSubjects: { type: "array", items: { type: "string" } },
    // No minimum/maximum: structured outputs reject them. readIntent clamps.
    minPages: { type: ["integer", "null"] },
    maxPages: { type: ["integer", "null"] },
    format: { type: "string", enum: [...FORMATS, "any"] },
    rereads: { type: "boolean" },
  },
  required: ["moods", "avoidMoods", "pace", "genres", "subjects", "mustHaves", "mustNotHaves", "avoidSubjects", "minPages", "maxPages", "format", "rereads"],
  additionalProperties: false,
} as const;

const strings = (raw: unknown, max: number, len = 40) => {
  const out: string[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (typeof item !== "string") continue;
    const clean = item.toLowerCase().replace(/\s+/g, " ").trim().slice(0, len);
    if (clean.length >= 2 && !out.includes(clean)) out.push(clean);
    if (out.length >= max) break;
  }
  return out;
};

function fromSet<T extends string>(raw: unknown, set: readonly T[], max: number): T[] {
  const out: T[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if ((set as readonly unknown[]).includes(item) && !out.includes(item as T)) out.push(item as T);
  }
  return out.slice(0, max);
}

const pages = (raw: unknown) =>
  typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.min(5000, Math.round(raw)) : null;

// Whatever came back, as a well-formed intent. Anything off the fixed sets is dropped.
export function readIntent(raw: unknown): ShelfIntent {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  let minPages = pages(r.minPages);
  let maxPages = pages(r.maxPages);
  if (minPages !== null && maxPages !== null && minPages > maxPages) [minPages, maxPages] = [maxPages, minPages];
  const moods = fromSet(r.moods, MOODS, 4);
  return {
    moods,
    avoidMoods: fromSet(r.avoidMoods, MOODS, 4).filter((m) => !moods.includes(m)),
    pace: (PACES as readonly unknown[]).includes(r.pace) ? (r.pace as Pace) : null,
    genres: strings(r.genres, 4),
    subjects: strings(r.subjects, 10),
    mustHaves: strings(r.mustHaves, 6, 60),
    mustNotHaves: fromSet(r.mustNotHaves, WARNING_TOPICS, 10),
    avoidSubjects: strings(r.avoidSubjects, 6),
    minPages,
    maxPages,
    format: (FORMATS as readonly unknown[]).includes(r.format) ? (r.format as AskFormat) : null,
    rereads: r.rereads === true,
  };
}

export async function parseIntent(query: string, ask: AskJson): Promise<ShelfIntent> {
  const { data } = await ask({
    system: INTENT_SYSTEM,
    prompt: JSON.stringify({ request: query.slice(0, ASK_QUERY_MAX) }),
    schema: INTENT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 2048,
    effort: "low",
    // A reader is waiting, and both jobs are lookups, not reasoning.
    thinking: false,
  });
  return readIntent(data);
}

// True when the intent gives retrieval something to go on.
export const hasSearchableIntent = (intent: ShelfIntent) =>
  intent.moods.length + intent.genres.length + intent.subjects.length + intent.mustHaves.length > 0
  || intent.minPages !== null || intent.maxPages !== null || intent.format !== null;

// Only a length or a format ("a short read", "an audiobook"): retrieval goes by editions instead of words.
export const isShapeOnly = (intent: ShelfIntent) =>
  intent.moods.length + intent.genres.length + intent.subjects.length + intent.mustHaves.length === 0;

// ---- Step 2: retrieval and scoring ---------------------------------------------------------------

// A work from the catalog, with what readers have tagged it with.
export interface CatalogCandidate {
  workId: string;
  // Open Library work key (OL45883W), when the work has one.
  workKey: string | null;
  title: string;
  authors: string[];
  description: string | null;
  subjects: string[];
  coverUrl: string | null;
  // Typical page count across the work's editions; null when nobody knows.
  pages: number | null;
  formats: AskFormat[];
  year: number | null;
  seriesName: string | null;
  seriesPosition: number | null;
  // From ReaderTags (lib/workTags.ts aggregateTags).
  tagReaders: number;
  moods: MoodCount[];
  warnings: WarningSummary[];
}

// A book on the asking reader's shelf.
export interface ShelfEntry {
  workId: string | null;
  workKey: string | null;
  status: string;
  rating?: number | null;
}

export interface SignalPerson {
  username: string | null;
  image: string | null;
  favColour: string | null;
}

// Why a result is above the cold matches. Never invented by the model: these come from the database.
export type FriendSignal =
  | { kind: "followed"; people: SignalPerson[]; rating: number }
  | { kind: "circle"; people: SignalPerson[]; count: number; together: boolean };

// Genres the reader can name, as the subject words that show a work belongs. A work matches a genre
// when every word of one group is in its subjects or description.
const GENRE_GROUPS: Record<string, string[][]> = {
  romantasy: [["romantasy"], ["fantasy", "romance"], ["fantasy", "love stories"]],
  "fantasy romance": [["romantasy"], ["fantasy", "romance"], ["fantasy", "love stories"]],
  fantasy: [["fantasy"], ["magic"]],
  romance: [["romance"], ["love stories"], ["romantic"]],
  "science fiction": [["science fiction"], ["sci-fi"], ["science-fiction"]],
  "sci-fi": [["science fiction"], ["sci-fi"], ["science-fiction"]],
  mystery: [["mystery"], ["detective"]],
  thriller: [["thriller"], ["suspense"]],
  horror: [["horror"], ["ghost"]],
  "historical fiction": [["historical fiction"], ["historical"]],
  "literary fiction": [["literary fiction"], ["literary"]],
  "young adult": [["young adult"], ["juvenile"], ["teen"]],
  contemporary: [["contemporary"]],
};

const genreGroups = (genre: string) => GENRE_GROUPS[genre] ?? [[genre]];

// The words a search for this intent looks for, for the database's first pass.
export function searchTerms(intent: ShelfIntent): string[] {
  const terms = new Set<string>();
  for (const genre of intent.genres) for (const group of genreGroups(genre)) group.forEach((t) => terms.add(t));
  intent.subjects.forEach((t) => terms.add(t));
  intent.mustHaves.forEach((t) => terms.add(t));
  return Array.from(terms);
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Whole words (or phrases), so "war" doesn't match "warm" or "award".
const wordRegex = (term: string) => new RegExp(`(^|[^a-z0-9])${escape(term.toLowerCase())}(s|es)?($|[^a-z0-9])`, "i");

interface Haystack {
  subjects: string;
  description: string;
  title: string;
}

const haystackOf = (c: CatalogCandidate): Haystack => ({
  subjects: c.subjects.join(" | ").toLowerCase(),
  description: (c.description ?? "").toLowerCase(),
  title: c.title.toLowerCase(),
});

const inSubjectsOrBlurb = (hay: Haystack, term: string) => {
  const re = wordRegex(term);
  return re.test(hay.subjects) || re.test(hay.description);
};

// Words that only say what kind of book it is. As a theme they're worth little: "romance" in the
// themes of a request for an enemies-to-lovers romance matches half the catalog.
const GENRE_WORDS = new Set([...Object.keys(GENRE_GROUPS), ...Object.values(GENRE_GROUPS).flat(2), "fiction", "novel", "love story", "love"]);

const moodShare = (c: CatalogCandidate, mood: Mood) => c.moods.find((m) => m.mood === mood)?.share ?? 0;

const PACE_MOODS: Record<Pace, Mood[]> = { fast: ["TENSE", "ADVENTUROUS"], medium: [], slow: ["REFLECTIVE"] };

// Warnings the reader ruled out, as words that would show up in subjects when no reader has tagged it.
const WARNING_SUBJECT_WORDS: Partial<Record<WarningTopic, string[]>> = {
  "Sexual assault": ["rape", "sexual assault", "sexual violence", "sexual abuse"],
  "Sexual content": ["erotica", "erotic"],
  "Child abuse": ["child abuse", "child sexual abuse"],
  Suicide: ["suicide"],
  "Self-harm": ["self-harm", "self-mutilation"],
  Incest: ["incest"],
  Torture: ["torture"],
  "Domestic violence": ["domestic violence", "family violence"],
};

export interface Scored {
  candidate: CatalogCandidate;
  score: number;
  // What it matched, for the reasons call and for checking results by hand.
  matched: string[];
  // How many of the reader's moods, themes and must-haves it matched, beyond the genre.
  beyondGenre: number;
  // How many must-haves, and how many themes (not genre words), it matched.
  mustHits: number;
  themeHits: number;
}

export type Exclusion = "shelf" | "warning" | "avoided" | "length" | "genre" | "irrelevant";

// One candidate against the intent: a score, or why it's out. Pure.
export function scoreCandidate(intent: ShelfIntent, candidate: CatalogCandidate): Scored | { excluded: Exclusion } {
  const hay = haystackOf(candidate);

  // Hard filters first.
  const warned = new Set(candidate.warnings.map((w) => w.topic));
  for (const topic of intent.mustNotHaves) {
    if (warned.has(topic)) return { excluded: "warning" };
    if ((WARNING_SUBJECT_WORDS[topic] ?? []).some((word) => wordRegex(word).test(hay.subjects))) return { excluded: "warning" };
  }
  if (intent.avoidSubjects.some((term) => inSubjectsOrBlurb(hay, term))) return { excluded: "avoided" };
  // Most of the readers who tagged it call it a mood the reader wants to avoid.
  if (intent.avoidMoods.some((mood) => candidate.tagReaders > 0 && moodShare(candidate, mood) >= 0.5)) return { excluded: "avoided" };
  if (candidate.pages !== null) {
    if (intent.maxPages !== null && candidate.pages > intent.maxPages) return { excluded: "length" };
    if (intent.minPages !== null && candidate.pages < intent.minPages) return { excluded: "length" };
  }
  const genresHit = intent.genres.filter((g) => genreGroups(g).some((group) => group.every((t) => inSubjectsOrBlurb(hay, t))));
  if (intent.genres.length > 0 && genresHit.length === 0) return { excluded: "genre" };

  // Then relevance. Must-haves are what the reader insisted on, so they weigh most; a theme that is
  // only a genre word weighs least and doesn't count as matching anything beyond the genre.
  let score = 0;
  let beyondGenre = 0;
  let mustHits = 0;
  let themeHits = 0;
  const matched: string[] = [];
  for (const genre of genresHit) {
    score += 3;
    matched.push(genre);
  }
  for (const subject of intent.subjects) {
    const re = wordRegex(subject);
    let hit = re.test(hay.subjects) ? 3 : re.test(hay.description) ? 2 : re.test(hay.title) ? 1 : 0;
    // Readers' warnings describe what's in a book too: "grief" is a theme as well as a warning.
    if (!hit && candidate.warnings.some((w) => re.test(w.topic))) hit = 2;
    if (!hit) continue;
    matched.push(subject);
    if (GENRE_WORDS.has(subject)) score += 1;
    else {
      score += hit;
      beyondGenre++;
      themeHits++;
    }
  }
  for (const want of intent.mustHaves) {
    if (!inSubjectsOrBlurb(hay, want)) continue;
    matched.push(want);
    // "magic" as a must-have for a fantasy request says no more than the genre does.
    if (GENRE_WORDS.has(want)) score += 1;
    else {
      score += 5;
      beyondGenre++;
      mustHits++;
    }
  }
  for (const mood of intent.moods) {
    const share = moodShare(candidate, mood);
    if (share > 0) {
      score += 5 * share;
      beyondGenre++;
      matched.push(MOOD_LABEL[mood]);
    }
  }
  if (intent.pace) for (const mood of PACE_MOODS[intent.pace]) score += 1.5 * moodShare(candidate, mood);
  for (const mood of intent.avoidMoods) score -= 4 * moodShare(candidate, mood);
  if (intent.format && candidate.formats.includes(intent.format)) score += 1;
  // A length was asked for: in range counts for a little, unknown counts against a little (still shown).
  if (intent.minPages !== null || intent.maxPages !== null) score += candidate.pages === null ? -0.5 : 1;
  if (score <= 0) return { excluded: "irrelevant" };
  return { candidate, score, matched, beyondGenre, mustHits, themeHits };
}

// The reader's shelf, by work. NOT_INTERESTED is always left out, re-reads or not; everything else is
// left out unless re-reads were asked for.
function shelfLookup(shelf: ShelfEntry[]) {
  const ids = new Map<string, ShelfEntry>();
  const keys = new Map<string, ShelfEntry>();
  for (const entry of shelf) {
    if (entry.workId) ids.set(entry.workId, entry);
    if (entry.workKey) keys.set(entry.workKey, entry);
  }
  return (c: CatalogCandidate) => ids.get(c.workId) ?? (c.workKey ? keys.get(c.workKey) : undefined) ?? null;
}

// A re-read request: books the reader finished and rated this well come first among the matches.
const REREAD_LOVED_RATING = 4;
const REREAD_BOOST = 4;

const signalTier = (signal: FriendSignal | null) => (signal?.kind === "followed" ? 0 : signal?.kind === "circle" ? 1 : 2);

// A strong match scores at least this share of the best one and matches more than the genre. When any
// candidate meets one of the reader's must-haves, only those can be strong (likewise themes before moods).
export const STRONG_MATCH_SHARE = 0.5;

export interface Ranked extends Scored {
  signal: FriendSignal | null;
  strong: boolean;
  // Set when the book is on the reader's own shelf (only possible on a re-read request).
  shelf: { status: string; rating: number | null } | null;
}

// Candidates → the ranked results: shelf out (unless re-reads), filters, score, then friends first.
//
// Friends first among the strong matches: a book people the reader follows rated 4+ comes before a cold
// book that fits just as well, then books from their circles, then the rest. A friend's favourite that
// only shares the genre doesn't jump a book that is what the reader asked for; it leads the weaker
// matches below them instead.
export function rankCandidates(
  intent: ShelfIntent,
  candidates: CatalogCandidate[],
  shelf: ShelfEntry[],
  signals: Map<string, FriendSignal>,
  limit = ASK_RESULTS_MAX,
): Ranked[] {
  const shelfEntry = shelfLookup(shelf);
  const askedBeyondGenre = intent.moods.length + intent.subjects.length + intent.mustHaves.length > 0;
  const seen = new Set<string>();
  const scored: (Scored & { entry: ShelfEntry | null })[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.workId)) continue;
    seen.add(candidate.workId);
    const entry = shelfEntry(candidate);
    if (entry && (!intent.rereads || entry.status === "NOT_INTERESTED")) continue;
    const result = scoreCandidate(intent, candidate);
    if ("excluded" in result) continue;
    if (entry && entry.status === "COMPLETED" && (entry.rating ?? 0) >= REREAD_LOVED_RATING) result.score += REREAD_BOOST;
    scored.push({ ...result, entry });
  }

  // How a strong match is judged: by the most specific kind of match any candidate reached. Must-haves
  // if anything met one, else themes, else moods and genre.
  // When the reader named themes or must-haves and no book meets any of them, nothing is strong: a mood
  // match alone is "the closest", not "what was asked for".
  const askedThemes = [...intent.subjects, ...intent.mustHaves].some((t) => !GENRE_WORDS.has(t));
  const level = (s: Scored) =>
    scored.some((x) => x.mustHits > 0) ? s.mustHits
    : scored.some((x) => x.themeHits > 0) ? s.themeHits
    : askedThemes ? 0
    : s.beyondGenre;
  const pool = scored.filter((s) => level(s) > 0);
  const best = Math.max(0, ...pool.map((s) => s.score));
  const noLevel = !askedThemes && !askedBeyondGenre;
  const ranked: Ranked[] = scored.map(({ entry, ...s }) => ({
    ...s,
    signal: signals.get(s.candidate.workId) ?? null,
    // A genre- or length-only request has nothing finer to judge by: everything that passed is strong.
    strong: noLevel || (level(s) > 0 && s.score >= best * STRONG_MATCH_SHARE),
    shelf: entry ? { status: entry.status, rating: entry.rating ?? null } : null,
  }));
  ranked.sort((a, b) =>
    Number(b.strong) - Number(a.strong)
    || signalTier(a.signal) - signalTier(b.signal)
    || b.score - a.score
    || (b.candidate.tagReaders - a.candidate.tagReaders)
    || a.candidate.title.localeCompare(b.candidate.title));
  return ranked.slice(0, limit);
}

// ---- Step 4: one book-only reason per result -----------------------------------------------------

const REASONS_SYSTEM = `You write one short line about each book you're given, for a search results page. The line says what the book is like, in the terms of the search, using only the facts given about that book.

Rules:
- Write about the book only. Never address or mention the reader: no "you", "your", "readers", "fans", "perfect for", "if you like".
- Use only the given description, subjects and moods. Don't invent plot, characters or details that aren't there. If little is given, write a shorter line.
- Never comment on the information itself ("few details given", "described as", "according to its tags"): just say what the book is like.
- Never mention any other book, series or author.
- No spoilers beyond what the description gives away.
- One sentence, at most 25 words, plain and specific. No marketing language ("unputdownable", "masterpiece").
- Answer for every book, by its number.`;

export const REASONS_SCHEMA = {
  type: "object",
  properties: {
    reasons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer", description: "The book's number, as given." },
          reason: { type: "string" },
        },
        required: ["i", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["reasons"],
  additionalProperties: false,
} as const;

// What the reasons call sees: the search's terms (not the reader's words) and the books' own facts.
export function reasonsPromptFor(intent: ShelfIntent, results: Ranked[]) {
  return JSON.stringify({
    search: {
      moods: intent.moods.map((m) => MOOD_LABEL[m]),
      pace: intent.pace,
      genres: intent.genres,
      themes: intent.subjects,
      mustHaves: intent.mustHaves,
      avoiding: [...intent.mustNotHaves, ...intent.avoidSubjects],
    },
    books: results.map(({ candidate: c }, i) => ({
      i,
      title: c.title,
      author: c.authors[0] ?? null,
      year: c.year,
      pages: c.pages,
      description: c.description ? c.description.slice(0, 700) : null,
      subjects: c.subjects.filter((s) => !/^nyt:|^form:|new york times|bestseller|reviewed|accessible book|protected daisy|in library/i.test(s)).slice(0, 15),
      moods: shownMoods(c.moods, c.tagReaders, 4).map((m) => MOOD_LABEL[m.mood]),
    })),
  });
}

// Anything that talks to or about the reader, or reads like an ad.
const ABOUT_THE_READER = /\b(you|your|you're|you'll|yours|yourself|reader|readers|fans?|perfect for|if you)\b/i;
// The model talking about what it was handed instead of about the book.
const ABOUT_THE_PROMPT = /\b(few|no|little) (other |more )?(details|information|description|subjects)\b|\blittle more\b|\b(details|information|more) (is |are )?(given|provided|known)\b|\bdescribed as\b|\baccording to\b/i;

// A reason as shown, or null when it breaks the rules (the card then shows no reason, not a bad one).
export function cleanReason(raw: unknown, own: CatalogCandidate, others: CatalogCandidate[]): string | null {
  if (typeof raw !== "string") return null;
  let text = raw.replace(/\s+/g, " ").trim();
  if (text.length < 8 || ABOUT_THE_READER.test(text) || ABOUT_THE_PROMPT.test(text)) return null;
  const lower = text.toLowerCase();
  // Another result's title in this one's reason (short titles are too likely to be ordinary words).
  if (others.some((o) => o.workId !== own.workId && o.title.length >= 6 && lower.includes(o.title.toLowerCase()))) return null;
  if (text.length > REASON_MAX) text = `${text.slice(0, REASON_MAX).replace(/\s+\S*$/, "")}…`;
  return text;
}

export async function writeReasons(intent: ShelfIntent, results: Ranked[], ask: AskJson): Promise<Map<string, string>> {
  const reasons = new Map<string, string>();
  if (results.length === 0) return reasons;
  const { data } = await ask({
    system: REASONS_SYSTEM,
    prompt: reasonsPromptFor(intent, results),
    schema: REASONS_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 4096,
    effort: "low",
    // A reader is waiting, and both jobs are lookups, not reasoning.
    thinking: false,
  });
  const list = Array.isArray((data as { reasons?: unknown })?.reasons) ? (data as { reasons: unknown[] }).reasons : [];
  const candidates = results.map((r) => r.candidate);
  for (const item of list) {
    const { i, reason } = (item ?? {}) as { i?: unknown; reason?: unknown };
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= results.length) continue;
    const own = results[i].candidate;
    const clean = cleanReason(reason, own, candidates);
    if (clean && !reasons.has(own.workId)) reasons.set(own.workId, clean);
  }
  return reasons;
}

// ---- The whole search ----------------------------------------------------------------------------

export interface CatalogSource {
  // Works that might match: a first pass in the database, scored properly by rankCandidates.
  candidates(intent: ShelfIntent): Promise<CatalogCandidate[]>;
  shelf(userId: string): Promise<ShelfEntry[]>;
  // Friend signals for the given works, by workId.
  signals(userId: string, candidates: CatalogCandidate[]): Promise<Map<string, FriendSignal>>;
}

export interface AskShelfDeps {
  ask: AskJson;
  catalog: CatalogSource;
}

export interface AskResult {
  workId: string;
  workKey: string | null;
  title: string;
  author: string;
  coverUrl: string | null;
  pages: number | null;
  year: number | null;
  seriesName: string | null;
  seriesPosition: number | null;
  moods: MoodCount[];
  warnings: WarningSummary[];
  tagReaders: number;
  signal: FriendSignal | null;
  // Written by the model, labelled as such in the UI. Null when it wasn't written or broke the rules.
  reason: string | null;
  matched: string[];
  // Fits what was asked; false for the weaker matches listed after them.
  strong: boolean;
  // On the reader's own shelf: only on a re-read request.
  shelf: { status: string; rating: number | null } | null;
}

export interface AskShelfResponse {
  intent: ShelfIntent;
  results: AskResult[];
  // "failed": the books were found but the reasons call didn't come back; results show without them.
  reasons: "done" | "failed" | "none";
}

const toResult = (r: Ranked, reason: string | null): AskResult => ({
  workId: r.candidate.workId,
  workKey: r.candidate.workKey,
  title: r.candidate.title,
  author: r.candidate.authors[0] ?? "Unknown",
  coverUrl: r.candidate.coverUrl,
  pages: r.candidate.pages,
  year: r.candidate.year,
  seriesName: r.candidate.seriesName,
  seriesPosition: r.candidate.seriesPosition,
  moods: shownMoods(r.candidate.moods, r.candidate.tagReaders, 3),
  warnings: r.candidate.warnings,
  tagReaders: r.candidate.tagReaders,
  signal: r.signal,
  reason,
  matched: r.matched,
  strong: r.strong,
  shelf: r.shelf,
});

// The search. Throws an AiError when the intent call fails (the caller refunds the allowance); a
// failed reasons call only costs the reasons.
export async function askShelf(userId: string, query: string, deps: AskShelfDeps): Promise<AskShelfResponse> {
  const intent = await parseIntent(query, deps.ask);
  if (!hasSearchableIntent(intent)) return { intent, results: [], reasons: "none" };

  const candidates = await deps.catalog.candidates(intent);
  const [shelf, signals] = await Promise.all([deps.catalog.shelf(userId), deps.catalog.signals(userId, candidates)]);
  const ranked = rankCandidates(intent, candidates, shelf, signals);
  if (ranked.length === 0) return { intent, results: [], reasons: "none" };

  let reasons = new Map<string, string>();
  let status: AskShelfResponse["reasons"] = "done";
  try {
    reasons = await writeReasons(intent, ranked, deps.ask);
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    status = "failed";
  }
  return { intent, results: ranked.map((r) => toResult(r, reasons.get(r.candidate.workId) ?? null)), reasons: status };
}
