import type { ImportCandidate } from "./types.ts";
import { AI_MODELS, aiAvailable, askJson } from "../ai/client.ts";

// The model-assisted pass for rows neither the ISBN nor the title search settled. It only ever
// chooses among the Open Library works the search already found for a row (or says none of them is
// it); it never names a book of its own. Claude Haiku 5.5, a batch of rows per request, structured
// output, and a cap on rows per import so a 10,000-book file costs cents, not dollars.
//
// Without ANTHROPIC_API_KEY, or when a request fails, the pass is skipped and the rows stay unmatched:
// the reader matches them afterwards, as before. Nothing here throws.
//
// The call itself is injectable (`ask`), so scripts/test/import-broken.test.ts runs this with a fake
// model and no network. Kept free of "@/" imports for the same reason. The client, key check and
// structured-output handling are the shared ones in lib/ai/client.ts.

export const LLM_MODEL = AI_MODELS.fast;
export const LLM_ROWS_PER_CALL = 25;
// Rows beyond this per import are skipped (left unmatched). ~150 input tokens a row plus a short
// answer: 500 rows is about a cent at Claude Haiku 5.5's prices.
export const LLM_MAX_ROWS_PER_IMPORT = 500;
// Picks below this are discarded: the model is saying "probably not any of these".
export const LLM_MIN_CONFIDENCE = 0.3;

export interface LlmRowInput {
  // The row's index in the job, echoed back in the pick.
  index: number;
  title: string;
  author: string;
  // From the file: when this edition was published, and its binding, if known.
  year: number | null;
  format: string | null;
  candidates: ImportCandidate[];
}

export interface LlmPick {
  index: number;
  // Position in the row's candidates, or null for "none of these".
  candidate: number | null;
  // 0 to 1.
  confidence: number;
}

export type AskFn = (rows: LlmRowInput[]) => Promise<LlmPick[]>;

export interface LlmOutcome {
  // skipped: no key, so nothing was asked. failed: a request failed; whatever was answered before it is kept.
  status: "done" | "skipped" | "failed";
  picks: Map<number, LlmPick>;
  // Rows a request was made for (answered or not). The rest are still pending.
  attempted: Set<number>;
  reason?: string;
}

export const llmAvailable = aiAvailable;

const SYSTEM = `You match rows from a reader's book export (Goodreads or StoryGraph) to Open Library works.

For each row you get the title, author, publication year and binding as the reader's file has them, and a short list of candidate works found by searching Open Library. Decide which candidate, if any, is the same book.

Rules:
- Choose only among the candidates given. Never suggest a book that isn't listed.
- The same book in another edition, translation, binding or with a subtitle, series tag or "deluxe edition" added still counts as the same work.
- A different book by the same author, a sequel, a companion, a study guide, a boxed set of several books or a summary of the book is NOT the same work.
- confidence is how sure you are the chosen candidate is this book: 0.95+ when title and author plainly agree, around 0.6 when it is probably right but something (author, year, wording) doesn't quite fit, and candidate null when none of them is it.
- Answer for every row, in the order given.`;

// JSON Schema for the answer (also what Anthropic's structured outputs enforce).
export const PICKS_SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          r: { type: "integer", description: "The row's index, as given." },
          c: { type: ["integer", "null"], description: "The chosen candidate's position, or null for none." },
          // No minimum/maximum: structured outputs reject them, and readPicks clamps to 0–1 anyway.
          confidence: { type: "number", description: "0 to 1." },
        },
        required: ["r", "c", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["picks"],
  additionalProperties: false,
} as const;

// What one request shows the model: just what it needs to compare, nothing a reader wrote.
export const promptFor = (rows: LlmRowInput[]) =>
  JSON.stringify(
    rows.map((row) => ({
      r: row.index,
      title: row.title,
      author: row.author,
      year: row.year,
      format: row.format?.toLowerCase() ?? null,
      candidates: row.candidates.map((c, i) => ({ c: i, title: c.title, authors: c.authors.slice(0, 3), year: c.year })),
    })),
  );

// Takes whatever came back and keeps only well-formed picks for rows that were asked about.
export function readPicks(raw: unknown, rows: LlmRowInput[]): LlmPick[] {
  const byIndex = new Map(rows.map((r) => [r.index, r]));
  const list = Array.isArray((raw as { picks?: unknown })?.picks) ? ((raw as { picks: unknown[] }).picks) : [];
  const picks: LlmPick[] = [];
  for (const item of list) {
    const p = item as { r?: unknown; c?: unknown; confidence?: unknown };
    const row = typeof p.r === "number" ? byIndex.get(p.r) : undefined;
    if (!row) continue;
    const c = typeof p.c === "number" && Number.isInteger(p.c) && p.c >= 0 && p.c < row.candidates.length ? p.c : null;
    const confidence = typeof p.confidence === "number" && Number.isFinite(p.confidence) ? Math.min(1, Math.max(0, p.confidence)) : 0;
    picks.push({ index: row.index, candidate: c, confidence });
  }
  return picks;
}

// One request to Claude Haiku 5.5 for a batch of rows. Throws on any failure (the caller skips the pass).
export const askClaude: AskFn = async (rows) => {
  const { data } = await askJson({
    model: LLM_MODEL,
    // Room for the model's (brief) thinking as well as 25 short answers.
    maxTokens: 4096,
    // A matching task, not a reasoning one: least thinking, and a schema the answer must fit.
    effort: "low",
    schema: PICKS_SCHEMA as unknown as Record<string, unknown>,
    system: SYSTEM,
    prompt: promptFor(rows),
  });
  return readPicks(data, rows);
};

// Asks about `rows` in batches until they're done, the deadline passes, or a request fails.
export async function pickWithModel(
  rows: LlmRowInput[],
  opts: { ask?: AskFn | null; deadline?: number } = {},
): Promise<LlmOutcome> {
  const picks = new Map<number, LlmPick>();
  const attempted = new Set<number>();
  if (rows.length === 0) return { status: "done", picks, attempted };

  const ask = opts.ask === undefined ? (llmAvailable() ? askClaude : null) : opts.ask;
  if (!ask) return { status: "skipped", picks, attempted, reason: "ANTHROPIC_API_KEY isn't set" };

  const deadline = opts.deadline ?? Infinity;
  for (let n = 0; n < rows.length; n += LLM_ROWS_PER_CALL) {
    if (Date.now() >= deadline) break;
    const batch = rows.slice(n, n + LLM_ROWS_PER_CALL);
    try {
      const answers = await ask(batch);
      for (const row of batch) attempted.add(row.index);
      for (const pick of answers) if (attempted.has(pick.index)) picks.set(pick.index, pick);
    } catch (err) {
      return { status: "failed", picks, attempted, reason: err instanceof Error ? err.message : String(err) };
    }
  }
  return { status: "done", picks, attempted };
}
