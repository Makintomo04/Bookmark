import { candidateToMatch } from "./match.ts";
import { LLM_MAX_ROWS_PER_IMPORT, LLM_MIN_CONFIDENCE, type LlmOutcome, type LlmRowInput } from "./llmMatch.ts";
import { type ImportCandidate, type ImportNoMatch, type ImportRow, type MatchEntry, asMatch, isUncertain } from "./types.ts";

// The review step's rules, as pure functions over the job's rows and match entries, so
// scripts/test/import-broken.test.ts covers them without a database:
//   - which rows still need the model, and how its answers become match entries;
//   - which rows the reader is shown before the import, and what each one-tap decision does.
// Kept free of "@/" imports.

export type Matches = Record<string, MatchEntry>;

// ---- The model pass ------------------------------------------------------------------------

// Not yet matched, has candidates, and the model hasn't been asked.
const awaitingModel = (entry: MatchEntry | undefined): entry is ImportNoMatch =>
  !!entry && entry.workKey === null && entry.candidates.length > 0 && entry.llm === undefined;

// Rows the model has already been asked about (with or without a pick), toward the per-import cap.
export function modelRowsUsed(matches: Matches): number {
  let n = 0;
  for (const entry of Object.values(matches)) {
    if (!entry) continue;
    if (entry.workKey === null ? entry.llm === "none" : entry.by === "llm") n++;
  }
  return n;
}

export const toLlmInput = (row: ImportRow, index: number, candidates: ImportCandidate[]): LlmRowInput => ({
  index,
  title: row.title,
  author: row.author,
  year: row.publishedYear,
  format: row.format,
  candidates,
});

// What to send next. Rows past the per-import cap are marked skipped here, so they stop counting as pending.
export function pendingForModel(rows: ImportRow[], matches: Matches, cap = LLM_MAX_ROWS_PER_IMPORT): LlmRowInput[] {
  let budget = cap - modelRowsUsed(matches);
  const inputs: LlmRowInput[] = [];
  rows.forEach((row, i) => {
    const entry = matches[i];
    if (!awaitingModel(entry)) return;
    if (budget > 0) {
      budget--;
      inputs.push(toLlmInput(row, i, entry.candidates));
    } else {
      entry.llm = "skipped";
    }
  });
  return inputs;
}

// Writes the model's answers into the entries. A pick becomes a match scored by the model (filed as is
// when confident, shown to the reader when not); "none" and low scores leave the row unmatched. When the
// pass was skipped or a request failed, every row still waiting is marked so, and none is asked again.
export function applyModelOutcome(matches: Matches, outcome: LlmOutcome) {
  outcome.picks.forEach((pick, index) => {
    const entry = matches[index];
    if (!awaitingModel(entry)) return;
    const chosen = pick.candidate !== null ? entry.candidates[pick.candidate] : undefined;
    if (chosen && pick.confidence >= LLM_MIN_CONFIDENCE) {
      matches[index] = { ...candidateToMatch(chosen, "llm", pick.confidence, entry.candidates), ...(entry.isbnDoubtful && { isbnDoubtful: true }) };
    } else {
      entry.llm = "none";
    }
  });
  outcome.attempted.forEach((index) => {
    const entry = matches[index];
    if (awaitingModel(entry)) entry.llm = "none";
  });
  if (outcome.status !== "done") {
    for (const entry of Object.values(matches)) if (awaitingModel(entry)) entry.llm = outcome.status;
  }
}

export const modelPending = (matches: Matches) => Object.values(matches).filter(awaitingModel).length;

// ---- The reader's review -------------------------------------------------------------------

export interface UncertainRow {
  index: number;
  title: string;
  author: string;
  year: number | null;
  format: string | null;
  pick: ImportCandidate;
  confidence: number;
  others: ImportCandidate[];
}

// Rows whose match scored below CONFIDENT and hasn't been confirmed or replaced by the reader.
export function uncertainRows(rows: ImportRow[], matches: Matches): UncertainRow[] {
  const out: UncertainRow[] = [];
  rows.forEach((row, index) => {
    const match = asMatch(matches[index]);
    if (!isUncertain(match)) return;
    out.push({
      index,
      title: row.title,
      author: row.author,
      year: row.publishedYear,
      format: row.format,
      pick: {
        workKey: match.workKey,
        title: match.title ?? null,
        authors: match.authors ?? [],
        year: match.year ?? null,
        coverUrl: match.coverUrl,
        pages: match.pages,
        subjects: match.subjects ?? [],
      },
      confidence: match.confidence ?? 0,
      others: match.candidates ?? [],
    });
  });
  return out;
}

export type Decision =
  // "That's right": file under the suggested work.
  | { choice: "accept" }
  // "Add as typed": no match; the book is added as the file has it (and can be matched afterwards).
  | { choice: "typed" }
  // "Pick another": one of the other candidates, or a search result.
  | { choice: "pick"; candidate: ImportCandidate };

// The entry after the reader's decision. Only an entry that is (or was) a match can be decided on; the
// reader may change their mind about a row until the import starts.
export function decide(entry: MatchEntry | undefined, decision: Decision): MatchEntry | undefined {
  const match = asMatch(entry);
  const offered = match?.candidates ?? (entry && entry.workKey === null ? entry.candidates : []);
  if (!match && !(entry && entry.workKey === null && entry.reviewed)) return undefined;
  // A doubtful ISBN stays doubtful through "add as typed" and "pick another": the ISBN still points at
  // the book the reader just said this isn't. Confirming an ISBN hit itself clears it.
  const isbnDoubtful = !!entry?.isbnDoubtful;
  switch (decision.choice) {
    case "accept":
      if (!match) return undefined;
      return { ...match, confidence: 1, reviewed: true, isbnDoubtful: isbnDoubtful && match.by !== "isbn13" && match.by !== "isbn" };
    case "typed": {
      // Keep the pick among the candidates, so "pick another" after "add as typed" can still offer it.
      const all = match ? [matchAsCandidate(match), ...offered] : offered;
      return { workKey: null, candidates: dedupe(all), llm: "rejected", reviewed: true, isbnDoubtful };
    }
    case "pick":
      return {
        ...candidateToMatch(decision.candidate, "reader", 1, dedupe(match ? [matchAsCandidate(match), ...offered] : offered)),
        isbnDoubtful,
      };
  }
}

const matchAsCandidate = (m: NonNullable<ReturnType<typeof asMatch>>): ImportCandidate => ({
  workKey: m.workKey,
  title: m.title ?? null,
  authors: m.authors ?? [],
  year: m.year ?? null,
  coverUrl: m.coverUrl,
  pages: m.pages,
  subjects: m.subjects ?? [],
});

const dedupe = (list: ImportCandidate[]) => {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.workKey) ? false : (seen.add(c.workKey), true)));
};

// ---- Dates ---------------------------------------------------------------------------------

// Finished books whose file gave no finish date. They import undated (BookRead.finishedAt null) rather
// than dated today, and the preview and summary say so.
export const undatedFinished = (rows: ImportRow[]) => rows.filter((r) => r.status === "COMPLETED" && !r.completedAt).length;
