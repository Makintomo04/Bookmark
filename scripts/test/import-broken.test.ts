// The import against deliberately broken exports: formula-guarded ISBNs, an empty-title row mid-file,
// day-first dates, audiobooks, a BOM with CRLF, stray quotes. Every valid row must import and every date
// survive. Also the model pass (with a fake model, and with no key at all) and the review decisions.
// No database, no network.
//
//   npm run test:import:broken
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanCsvText, detectFormat, inferDateOrder, normaliseDates, repairQuotes, unguard } from "../../lib/import/clean.ts";
import { parseDate, parseImport } from "../../lib/import/formats.ts";
import { DOUBTFUL, matchRows } from "../../lib/import/match.ts";
import { LLM_MIN_CONFIDENCE, type LlmRowInput, pickWithModel, readPicks } from "../../lib/import/llmMatch.ts";
import { type Matches, applyModelOutcome, decide, modelPending, pendingForModel, uncertainRows, undatedFinished } from "../../lib/import/review.ts";
import { buildRecords, newObjectId } from "../../lib/import/records.ts";
import { CONFIDENT, type ImportCandidate, type ImportRow, asMatch, effectiveMatch, isUncertain } from "../../lib/import/types.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/broken/${name}`, import.meta.url), "utf8");
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const NOW = new Date("2026-10-21T12:00:00Z");
const build = (row: ImportRow) => buildRecords(row, null, { userId: "u".repeat(24), bookId: newObjectId(), now: NOW, source: "goodreads" });

// ---- Pre-cleaner -------------------------------------------------------------------------

test("clean: BOM, NULs, formula guards and stray quotes", () => {
  assert.equal(cleanCsvText("﻿﻿a,b\n1,2"), "a,b\n1,2");
  assert.equal(cleanCsvText("\n\r\n a\u0000,b\n"), " a,b\n");
  assert.equal(unguard('="0441013597"'), "0441013597");
  assert.equal(unguard('=""'), "");
  assert.equal(unguard('"9780441013593"'), "9780441013593");
  assert.equal(unguard("  0441013597 "), "0441013597");
  // A quote inside a quoted field is escaped; a properly doubled one is left alone.
  assert.equal(repairQuotes('a,"The "Great" Gatsby",c'), 'a,"The ""Great"" Gatsby",c');
  assert.equal(repairQuotes('a,"say ""hi""",c'), 'a,"say ""hi""",c');
  assert.equal(repairQuotes('a,"quoted" ,c'), 'a,"quoted" ,c');
  // An unterminated quote loses its opening quote instead of swallowing the rows after it.
  assert.equal(repairQuotes('a,"oops,c\nd,e,f'), "a,oops,c\nd,e,f");
  // Quotes mid-field (unquoted) are text, as spreadsheets treat them.
  assert.equal(repairQuotes('a,5" floppy,c'), 'a,5" floppy,c');
});

test("clean: dates in every shape become YYYY/MM/DD, and nothing unreadable is guessed", () => {
  const dayFirst = { dayFirst: true, guessed: false };
  const monthFirst = { dayFirst: false, guessed: false };
  assert.equal(normaliseDates("2024/03/14", null), "2024/03/14");
  assert.equal(normaliseDates("2024-03-14", null), "2024/03/14");
  assert.equal(normaliseDates("2024-03-14T10:00:00Z", null), "2024/03/14");
  assert.equal(normaliseDates("2024/3/5", null), "2024/03/05");
  assert.equal(normaliseDates("14/03/2024", dayFirst), "2024/03/14");
  assert.equal(normaliseDates("14/03/2024", monthFirst), "2024/03/14", "a day over 12 settles it whatever the file's order");
  assert.equal(normaliseDates("05/02/2023", dayFirst), "2023/02/05");
  assert.equal(normaliseDates("05/02/2023", monthFirst), "2023/05/02");
  assert.equal(normaliseDates("14.03.2024", null), "2024/03/14");
  assert.equal(normaliseDates("Mar 14, 2024", null), "2024/03/14");
  assert.equal(normaliseDates("14 March 2024", null), "2024/03/14");
  assert.equal(normaliseDates("Sept 3rd, 2021", null), "2021/09/03");
  assert.equal(normaliseDates("03/01/2021-10/01/2021, 14/02/2025-20/02/2025", dayFirst), "2021/01/03-2021/01/10, 2025/02/14-2025/02/20");
  assert.equal(normaliseDates("31/02/2024", dayFirst), "31/02/2024", "a day the month doesn't have is no date, and is reported as unreadable");
  assert.equal(parseDate("2023/02/30"), null, "the mapper doesn't roll it into March either");
  assert.equal(normaliseDates("not a date", null), "not a date");

  assert.equal(inferDateOrder([]), null);
  assert.equal(inferDateOrder(["2024/03/14"]), null, "year-first dates say nothing about day order");
  assert.deepEqual(inferDateOrder(["05/02/2023", "01/01/2020"]), { dayFirst: true, guessed: true });
  assert.deepEqual(inferDateOrder(["05/02/2023", "14/03/2024"]), { dayFirst: true, guessed: false });
  assert.deepEqual(inferDateOrder(["05/02/2023", "03/14/2024"]), { dayFirst: false, guessed: false });
});

test("clean: audiobook and ebook formats from the binding, or from a shelf when the binding doesn't say", () => {
  assert.equal(detectFormat("Audible Audio", []), "AUDIOBOOK");
  assert.equal(detectFormat("MP3 CD", []), "AUDIOBOOK");
  assert.equal(detectFormat("Unknown Binding", ["audiobook", "fantasy"]), "AUDIOBOOK");
  assert.equal(detectFormat("", ["kindle"]), "EBOOK");
  assert.equal(detectFormat("Paperback", ["audiobooks"]), "PAPERBACK", "the binding wins when it's known");
  assert.equal(detectFormat("Unknown Binding", ["fantasy"]), null);
});

// ---- Fixtures ----------------------------------------------------------------------------

test("fixture: formula-guarded ISBNs import every row with clean ISBNs", () => {
  const { rows, skippedLines, notes } = parseImport(fixture("goodreads-formula-isbn.csv"));
  assert.equal(rows.length, 4);
  assert.deepEqual(skippedLines, []);
  assert.deepEqual(notes.quarantined, []);
  const by = Object.fromEntries(rows.map((r) => [r.title, r]));
  assert.equal(by["The Hobbit, or There and Back Again"].isbn13, "9780547928227");
  assert.equal(by["The Hobbit, or There and Back Again"].isbn10, "0547928220");
  assert.equal(by["Middlemarch"].isbn13, "9780141439549", "a half-stripped guard");
  assert.equal(by["Middlemarch"].isbn10, null);
  assert.equal(by["Dune"].isbn13, null);
  assert.equal(by["Piranesi"].isbn13, "9781635575965");
  assert.equal(by["Piranesi"].isbn10, "1635575966");
  assert.equal(day(by["The Hobbit, or There and Back Again"].completedAt), "2024-03-14");
  assert.equal(day(by["Piranesi"].completedAt), "2021-01-10");
});

test("fixture: an empty-title row mid-file is set aside, not fatal, and stray quotes don't eat the rows after them", () => {
  const { rows, skippedLines, notes } = parseImport(fixture("goodreads-empty-title.csv"));
  assert.deepEqual(rows.map((r) => r.title), ["Project Hail Mary", "The Name of the Wind", "Klara and the Sun", "Babel, or the Necessity of Violence"]);
  assert.deepEqual(skippedLines, [2]);
  assert.equal(notes.quarantined.length, 1);
  assert.equal(notes.quarantined[0].line, 2);
  assert.match(notes.quarantined[0].detail ?? "", /Unknown Author/);
  assert.match(notes.quarantined[0].detail ?? "", /9780000000002/);
  assert.equal(rows[1].review, 'Loved the "ending" a lot, honestly');
  assert.equal(day(rows[1].completedAt), "2023-02-02");
  assert.equal(rows[2].status, "STARTED");
  assert.equal(day(rows[3].completedAt), "2023-05-01", "the row after the unterminated quote still has its date");
  assert.equal(rows[3].isbn13, "9780063021426");
});

test("fixture: DD/MM/YYYY dates read as day-first, an ISO timestamp as its day, an unreadable date as blank", () => {
  const { rows, notes } = parseImport(fixture("goodreads-ddmmyyyy.csv"));
  assert.equal(rows.length, 4);
  assert.equal(notes.dayFirst, true);
  assert.equal(notes.dateOrderGuessed, false, "14/03/2024 settled the order");
  const [hobbit, middlemarch, dune, piranesi] = rows;
  assert.equal(day(hobbit.completedAt), "2024-03-14");
  assert.equal(day(hobbit.addedAt), "2019-06-02");
  assert.equal(day(middlemarch.completedAt), "2023-02-05", "ambiguous dates follow the file's order");
  assert.equal(day(middlemarch.addedAt), "2018-08-08");
  assert.equal(dune.completedAt, null);
  assert.equal(day(dune.addedAt), "2020-01-10");
  assert.equal(day(piranesi.addedAt), "2021-01-03");
  assert.equal(piranesi.completedAt, null, "an unreadable date stays blank");
  assert.equal(notes.unreadableDateCount, 1);
  assert.deepEqual(notes.unreadableDates, [{ line: 4, column: "Date Read", value: "not a date" }]);
  for (const row of rows) assert.equal(row.status, "COMPLETED");
  // Nothing invented: the undated finishes are undated reads, not today's.
  assert.equal(undatedFinished(rows), 2);
  for (const row of [dune, piranesi]) {
    const { book, reads } = build(row);
    assert.equal(book.completedAt, null);
    assert.equal(reads.length, 1);
    assert.equal(reads[0].finishedAt, null);
    assert.equal(reads[0].status, "COMPLETED");
  }
});

test("fixture: audiobook and ebook rows carry their format for the edition", () => {
  const { rows } = parseImport(fixture("goodreads-audiobook.csv"));
  assert.deepEqual(
    rows.map((r) => [r.title, r.format]),
    [["Project Hail Mary", "AUDIOBOOK"], ["The Hobbit", "AUDIOBOOK"], ["Dune", "EBOOK"], ["Middlemarch", "PAPERBACK"], ["Piranesi", "AUDIOBOOK"]],
  );
  assert.equal(rows[1].genre, "Fantasy", "the audiobook shelf doesn't hide the genre shelf");
  assert.equal(day(rows[0].completedAt), "2023-07-04");
});

test("fixture: a StoryGraph export with a BOM, CRLF rows and day-first ranges keeps every read", () => {
  const text = fixture("storygraph-bom-crlf.csv");
  assert.equal(text.charCodeAt(0), 0xfeff);
  assert.ok(text.includes("\r\n"));
  const { source, rows, notes } = parseImport(text);
  assert.equal(source, "storygraph");
  assert.equal(rows.length, 4);
  assert.equal(notes.dayFirst, true);
  const [piranesi, babel, tomorrow, klara] = rows;
  assert.deepEqual(piranesi.completedReads.map((r) => [day(r.startedAt), day(r.finishedAt)]), [
    ["2021-01-03", "2021-01-10"],
    ["2025-02-14", "2025-02-20"],
  ]);
  assert.equal(day(piranesi.completedAt), "2025-02-20");
  assert.equal(piranesi.review, "Haunting.\n\nSecond paragraph.");
  assert.equal(babel.format, "AUDIOBOOK");
  assert.equal(babel.status, "DNF");
  assert.equal(day(babel.stoppedAt), "2023-05-01");
  assert.equal(tomorrow.format, "EBOOK");
  assert.equal(day(tomorrow.startedAt), "2026-10-02");
  assert.equal(day(tomorrow.completedAt), "2024-01-09");
  assert.equal(klara.completedAt, null, "finished with no date: kept undated");
  assert.equal(undatedFinished(rows), 1);
});

test("inline: a month-first file is read as month-first once one date proves it", () => {
  const csv = [
    "Title,Author,ISBN,ISBN13,My Rating,Number of Pages,Date Read,Date Added,Bookshelves,Exclusive Shelf,My Review,Read Count",
    "A,A Author,,,4,100,03/14/2024,01/02/2024,,read,,1",
    "B,B Author,,,4,100,05/02/2023,,,read,,1",
  ].join("\r\n");
  const { rows, notes } = parseImport(csv);
  assert.equal(notes.dayFirst, false);
  assert.equal(day(rows[0].completedAt), "2024-03-14");
  assert.equal(day(rows[0].addedAt), "2024-01-02");
  assert.equal(day(rows[1].completedAt), "2023-05-02");
});

// ---- Matching: doubtful ISBN hits ---------------------------------------------------------

const doc = (key: string, title: string, author: string, extra: Record<string, unknown> = {}) => ({
  key: `/works/${key}`, title, author_name: [author], ...extra,
});

test("matching: an ISBN filed under another title is doubtful, with the title search's works as alternatives", async () => {
  const { rows } = parseImport(fixture("goodreads-formula-isbn.csv"));
  const fakeFetch = async (url: string) => {
    const q = new URL(url).searchParams;
    let docs: unknown[] = [];
    if (q.get("q")?.includes("isbn:")) {
      // Open Library has the Hobbit's ISBN on a boxed set, and Piranesi's on itself.
      docs = [
        doc("OL1W", "The Lord of the Rings Boxed Set", "J.R.R. Tolkien", { isbn: ["9780547928227"], cover_i: 1 }),
        doc("OL2W", "Piranesi", "Susanna Clarke", { isbn: ["9781635575965"], cover_i: 2 }),
      ];
    } else if (q.get("title")?.startsWith("The Hobbit")) {
      // The title search finds the Hobbit itself only as the second hit, behind a study guide.
      docs = [doc("OL3W", "The Hobbit: A Study Guide", "Someone Else", { cover_i: 3 }), doc("OL4W", "The Hobbit", "J.R.R. Tolkien", { cover_i: 4 })];
    }
    return { ok: true, json: async () => ({ docs }) };
  };
  const { matches } = await matchRows(rows, [0, 3], { deadline: Date.now() + 5000, fetchImpl: fakeFetch });
  const hobbit = asMatch(matches.get(0))!;
  // A plausible title hit outranks the doubtful ISBN hit.
  assert.equal(hobbit.workKey, "OL4W");
  assert.equal(hobbit.by, "title");
  assert.equal(hobbit.confidence, 1);
  const piranesi = asMatch(matches.get(3))!;
  assert.equal(piranesi.workKey, "OL2W");
  assert.equal(piranesi.confidence, 1);

  // With no plausible title hit, the doubtful ISBN hit is kept for the reader to check, alternatives attached.
  const onlyIsbn = async (url: string) => {
    const q = new URL(url).searchParams;
    const docs = q.get("q")?.includes("isbn:")
      ? [doc("OL1W", "The Lord of the Rings Boxed Set", "J.R.R. Tolkien", { isbn: ["9780547928227"], cover_i: 1 })]
      : [doc("OL3W", "The Hobbit: A Study Guide", "Someone Else", { cover_i: 3 })];
    return { ok: true, json: async () => ({ docs }) };
  };
  const second = (await matchRows(rows, [0], { deadline: Date.now() + 5000, fetchImpl: onlyIsbn })).matches;
  const doubtful = asMatch(second.get(0))!;
  assert.equal(doubtful.workKey, "OL1W");
  assert.equal(doubtful.confidence, DOUBTFUL);
  assert.ok(isUncertain(doubtful));
  assert.deepEqual(doubtful.candidates?.map((c) => c.workKey), ["OL3W"]);
  assert.equal(effectiveMatch(second.get(0)), null, "an unchecked doubtful match files as typed");
});

// ---- The model pass -----------------------------------------------------------------------

const candidate = (workKey: string, title: string, author: string, year: number | null = null): ImportCandidate => ({
  workKey, title, authors: [author], year, coverUrl: null, pages: null, subjects: ["Fiction"],
});

function pendingMatches(rows: ImportRow[]): Matches {
  const matches: Matches = {};
  rows.forEach((row, i) => {
    matches[i] = { workKey: null, candidates: [candidate(`OL${i}0W`, `${row.title}: A Companion`, "Someone Else"), candidate(`OL${i}1W`, row.title, row.author, 1990)] };
  });
  return matches;
}

test("model: with no ANTHROPIC_API_KEY the pass is skipped cleanly and the rows stay unmatched", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const { rows } = parseImport(fixture("goodreads-audiobook.csv"));
    const matches = pendingMatches(rows);
    const waiting = pendingForModel(rows, matches);
    assert.equal(waiting.length, rows.length);
    const outcome = await pickWithModel(waiting);
    assert.equal(outcome.status, "skipped");
    assert.equal(outcome.picks.size, 0);
    applyModelOutcome(matches, outcome);
    assert.equal(modelPending(matches), 0, "nothing left waiting, so the job goes ready");
    assert.ok(Object.values(matches).every((m) => m && m.workKey === null && m.llm === "skipped"));
    assert.equal(uncertainRows(rows, matches).length, 0);
    rows.forEach((_, i) => assert.equal(effectiveMatch(matches[i]), null));
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

test("model: picks become matches, confident ones file as is and doubtful ones wait for the reader", async () => {
  const { rows } = parseImport(fixture("goodreads-audiobook.csv"));
  const matches = pendingMatches(rows);
  const asked: LlmRowInput[][] = [];
  const fakeAsk = async (batch: LlmRowInput[]) => {
    asked.push(batch);
    return batch.map((row) => ({
      index: row.index,
      // Row 0: sure of the second candidate. Row 1: unsure. Row 2: none. Row 3: a pick scored too low to count.
      candidate: row.index === 2 ? null : row.index === 3 ? 0 : 1,
      confidence: row.index === 0 ? 0.97 : row.index === 1 ? 0.6 : row.index === 3 ? 0.1 : 0.9,
    }));
  };
  const outcome = await pickWithModel(pendingForModel(rows, matches), { ask: fakeAsk });
  assert.equal(outcome.status, "done");
  assert.equal(asked.length, 1, "one request for a handful of rows");
  assert.ok(asked[0][0].candidates.length === 2 && asked[0][0].title === "Project Hail Mary");
  applyModelOutcome(matches, outcome);
  assert.equal(modelPending(matches), 0);

  const sure = asMatch(matches[0])!;
  assert.equal(sure.workKey, "OL01W");
  assert.equal(sure.by, "llm");
  assert.ok(sure.confidence! >= CONFIDENT);
  assert.ok(effectiveMatch(matches[0]), "files without asking");
  assert.deepEqual(sure.candidates?.map((c) => c.workKey), ["OL00W"], "the other candidates stay for 'pick another'");

  const unsure = asMatch(matches[1])!;
  assert.equal(unsure.confidence, 0.6);
  assert.ok(isUncertain(unsure));
  assert.equal(effectiveMatch(matches[1]), null, "not filed until the reader says so");

  assert.equal(matches[2]?.workKey, null);
  assert.equal((matches[2] as { llm?: string }).llm, "none");
  assert.equal(matches[3]?.workKey, null, `a pick under ${LLM_MIN_CONFIDENCE} is no pick`);
  assert.equal(asMatch(matches[4])?.workKey, "OL41W");

  const review = uncertainRows(rows, matches);
  assert.deepEqual(review.map((u) => u.index), [1]);
  assert.equal(review[0].title, "The Hobbit");
  assert.equal(review[0].format, "AUDIOBOOK");
  assert.equal(review[0].pick.workKey, "OL11W");
  assert.deepEqual(review[0].others.map((c) => c.workKey), ["OL10W"]);
});

test("model: a failed request leaves the remaining rows unmatched and asks no more", async () => {
  const { rows } = parseImport(fixture("goodreads-audiobook.csv"));
  const matches = pendingMatches(rows);
  let calls = 0;
  const failing = async () => {
    calls++;
    throw new Error("boom");
  };
  const outcome = await pickWithModel(pendingForModel(rows, matches), { ask: failing });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.reason, "boom");
  applyModelOutcome(matches, outcome);
  assert.equal(calls, 1);
  assert.equal(modelPending(matches), 0);
  assert.ok(Object.values(matches).every((m) => m && m.workKey === null && m.llm === "failed"));
});

test("model: the per-import cap skips the rest, the deadline leaves them pending, and odd answers are dropped", async () => {
  const { rows } = parseImport(fixture("goodreads-audiobook.csv"));
  const matches = pendingMatches(rows);
  const waiting = pendingForModel(rows, matches, 2);
  assert.equal(waiting.length, 2);
  assert.equal(modelPending(matches), 2, "rows past the cap are marked skipped at once");
  assert.equal((matches[4] as { llm?: string }).llm, "skipped");

  const expired = await pickWithModel(waiting, { ask: async () => [], deadline: Date.now() - 1 });
  assert.equal(expired.status, "done");
  assert.equal(expired.attempted.size, 0, "nothing asked past the deadline");

  const row = waiting[0];
  const picks = readPicks({ picks: [{ r: row.index, c: 7, confidence: 0.9 }, { r: 999, c: 0, confidence: 1 }, { r: row.index, c: 1, confidence: 4 }] }, [row]);
  assert.deepEqual(picks, [{ index: row.index, candidate: null, confidence: 0.9 }, { index: row.index, candidate: 1, confidence: 1 }]);
  assert.deepEqual(readPicks("nonsense", [row]), []);
});

// ---- The reader's decisions ----------------------------------------------------------------

test("review: that's right / add as typed / pick another", () => {
  const pick = candidate("OL1W", "The Hobbit", "J.R.R. Tolkien", 1937);
  const other = candidate("OL2W", "The Hobbit: A Study Guide", "Someone Else");
  const uncertain = { ...pick, coverUrl: null, pages: null, genre: null, by: "llm" as const, title: pick.title, authors: pick.authors, subjects: pick.subjects, year: pick.year, confidence: 0.6, candidates: [other] };

  const accepted = decide(uncertain, { choice: "accept" });
  assert.equal(asMatch(accepted)?.reviewed, true);
  assert.ok(effectiveMatch(accepted), "files under the pick");
  assert.equal(asMatch(accepted)?.workKey, "OL1W");

  const typed = decide(uncertain, { choice: "typed" });
  assert.equal(typed?.workKey, null);
  assert.equal(effectiveMatch(typed), null);
  assert.deepEqual(typed && typed.workKey === null ? typed.candidates.map((c) => c.workKey) : [], ["OL1W", "OL2W"], "the pick stays on offer");

  const picked = decide(uncertain, { choice: "pick", candidate: other });
  assert.equal(asMatch(picked)?.workKey, "OL2W");
  assert.equal(asMatch(picked)?.by, "reader");
  assert.ok(effectiveMatch(picked));
  assert.deepEqual(asMatch(picked)?.candidates?.map((c) => c.workKey), ["OL1W"]);

  // Changing one's mind after "add as typed" is allowed; deciding on a row that was never offered isn't.
  assert.equal(asMatch(decide(typed, { choice: "pick", candidate: pick }))?.workKey, "OL1W");
  assert.equal(decide(null, { choice: "accept" }), undefined);
  assert.equal(decide({ workKey: null, candidates: [other] }, { choice: "typed" }), undefined);
});
