// Catch me up (lib/recap.ts): series eligibility, the resume bound, the spoiler lock on circle comments,
// the popularity gate, "not confident" refunds, the cache, the showRecaps preference, the allowance and a
// clean skip with no API key. A fake model and in-memory data: no network and no database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/recap.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { AiError, aiAvailable, askJson, type AskJson, type JsonRequest } from "@/lib/ai/client";
import { memoryUsageStore, monthKey, usageAccountOf, type UsageOptions } from "@/lib/ai/usage";
import type { CommentAuthor, CommentRow } from "@/lib/buddyReads";
import { preferencesOf } from "@/lib/preferences";
import {
  RECAP_BUCKET, STALE_DAYS, WELL_KNOWN, catchMeUp, earlierInSeries, isWellKnown, recapBucket, recapOptions, recapState, unlockedComments,
  type CircleThread, type FinishedInSeries, type NewRecap, type Popularity, type RecapContext, type RecapKey, type RecapNote,
  type RecapShelfBook, type RecapSource, type RecapWork, type StoredRecap,
} from "@/lib/recap";

// ---- Fixtures ------------------------------------------------------------------------------------

const NOW = new Date("2026-10-22T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const POPULAR: Popularity = { bookmarkReaders: 0, olEditions: 40, olRatings: 200, olReadingLog: 1500 };
const OBSCURE: Popularity = { bookmarkReaders: 2, olEditions: 3, olRatings: 1, olReadingLog: 12 };

function work(id: string, fields: Partial<RecapWork> = {}): RecapWork {
  return { id, title: `Work ${id}`, authors: ["Ann Author"], seriesName: null, seriesPosition: null, popularity: POPULAR, ...fields };
}

function book(fields: Partial<RecapShelfBook> = {}): RecapShelfBook {
  return {
    id: "book1", title: "Shelf copy", author: "Ann Author", status: "PAUSED", currentPage: 160, pages: 340,
    startedAt: daysAgo(40), progressAt: daysAgo(20), ...fields,
  };
}

const finished = (bookId: string, w: RecapWork, percent = 100): FinishedInSeries => ({ bookId, percent, work: w });

// A fake model: records each request and answers with `answer` (or whatever it returns for the request).
function fakeModel(answer: unknown | ((req: JsonRequest) => unknown)) {
  const calls: JsonRequest[] = [];
  const ask: AskJson = async (req) => {
    calls.push(req);
    return { data: typeof answer === "function" ? (answer as (r: JsonRequest) => unknown)(req) : answer, usage: { inputTokens: 0, outputTokens: 0 } };
  };
  return { ask, calls };
}

const WORDS = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const goodAnswer = (furthestPercent: number) => ({ confident: true, paragraphs: [WORDS(90), WORDS(90)], furthestPercent });

function memorySource(ctx: RecapContext | null, opts: { notes?: RecapNote[]; threads?: CircleThread[] } = {}): RecapSource & { saved: NewRecap[] } {
  const rows = new Map<string, StoredRecap>();
  const saved: NewRecap[] = [];
  const id = (k: RecapKey) => `${k.userId}|${k.workId}|${k.kind}|${k.bucket}`;
  return {
    saved,
    async context() { return ctx; },
    async notes(bookIds) { return (opts.notes ?? []).filter((n) => bookIds.includes(n.bookId)); },
    async circles(_userId, bookIds) { return (opts.threads ?? []).filter((t) => bookIds.includes(t.bookId)); },
    async cached(key) { return rows.get(id(key)) ?? null; },
    async save(recap) {
      saved.push(recap);
      const existing = rows.get(id(recap));
      if (existing) return existing;
      const stored: StoredRecap = {
        id: `recap${rows.size + 1}`, kind: recap.kind, bucket: recap.bucket, confident: recap.confident, paragraphs: recap.paragraphs,
        reachedPercent: recap.reachedPercent, coveredWorkIds: recap.coveredWorkIds, vote: null, createdAt: NOW,
      };
      rows.set(id(recap), stored);
      return stored;
    },
  };
}

const reader = { id: "reader", showRecaps: true };
const freeAccount = usageAccountOf({ plan: "FREE", timeZone: "Europe/London" });

function deps(ask: AskJson, source: RecapSource, store = memoryUsageStore(), available = true) {
  const usage: UsageOptions = { store, account: freeAccount, now: NOW };
  return { ask, source, available: () => available, usage, now: NOW, store };
}

const recapsUsed = (store: ReturnType<typeof memoryUsageStore>) => store.rows.get(`reader|recaps|${monthKey(NOW, "Europe/London")}`) ?? 0;

// ---- Series eligibility ----------------------------------------------------------------------------

test("a later series book is offered a recap of the earlier books the reader finished, in order", () => {
  const current = work("w3", { title: "Book Three", seriesName: "The Saga", seriesPosition: 3 });
  const one = work("w1", { title: "Book One", seriesName: "The Saga", seriesPosition: 1 });
  const two = work("w2", { title: "Book Two", seriesName: "the saga", seriesPosition: 2, authors: ["Ann Author", "Co Writer"] });
  const four = work("w4", { title: "Book Four", seriesName: "The Saga", seriesPosition: 4 });
  const otherSaga = work("w9", { title: "Other", seriesName: "The Saga", seriesPosition: 1, authors: ["Someone Else"] });
  const ctx: RecapContext = {
    book: book({ status: "NOT_STARTED", currentPage: 0 }),
    work: current,
    finishedInSeries: [finished("b2", two), finished("b4", four), finished("b1", one), finished("b9", otherSaga)],
  };
  assert.deepEqual(earlierInSeries(current, ctx.finishedInSeries).map((f) => f.work.id), ["w1", "w2"]);
  const { series, resume } = recapOptions(ctx, NOW);
  assert.ok(series);
  assert.equal(series.prompt, true);
  assert.equal(series.bound, 2);
  assert.deepEqual(series.books.map((b) => b.position), [1, 2]);
  assert.equal(resume, null, "nothing to recap of a book not started");
});

test("no series recap for the first book, without a finished earlier book, or once well into the new one", () => {
  const one = work("w1", { seriesName: "The Saga", seriesPosition: 1 });
  const two = work("w2", { seriesName: "The Saga", seriesPosition: 2 });
  assert.equal(recapOptions({ book: book({ status: "NOT_STARTED", currentPage: 0 }), work: one, finishedInSeries: [] }, NOW).series, null);
  assert.equal(recapOptions({ book: book({ status: "NOT_STARTED", currentPage: 0 }), work: two, finishedInSeries: [] }, NOW).series, null);
  const deep = recapOptions({ book: book({ status: "STARTED", currentPage: 200, progressAt: daysAgo(1) }), work: two, finishedInSeries: [finished("b1", one)] }, NOW);
  assert.ok(deep.series, "still there as an action");
  assert.equal(deep.series.prompt, false, "but no prompt card past the start");
  // A finished book the model wouldn't know isn't covered; with nothing left, there's no offer.
  const obscure = work("w1", { seriesName: "The Saga", seriesPosition: 1, popularity: OBSCURE });
  assert.equal(recapOptions({ book: book({ status: "NOT_STARTED", currentPage: 0 }), work: two, finishedInSeries: [finished("b1", obscure)] }, NOW).series, null);
});

test("a series recap covers the earlier books and says nothing is to come from the new one", async () => {
  const one = work("w1", { title: "Book One", seriesName: "The Saga", seriesPosition: 1 });
  const two = work("w2", { title: "Book Two", seriesName: "The Saga", seriesPosition: 2 });
  const source = memorySource(
    { book: book({ status: "NOT_STARTED", currentPage: 0 }), work: two, finishedInSeries: [finished("b1", one)] },
    { notes: [{ bookId: "b1", title: "Ending", content: "The heir is crowned." }, { bookId: "book1", title: null, content: "not this book" }] },
  );
  const { ask, calls } = fakeModel(goodAnswer(0));
  const result = await catchMeUp(reader, "book1", "SERIES", deps(ask, source));
  assert.equal(result.status, "ready");
  assert.match(calls[0].system, /Say nothing about the book they are starting/);
  const sent = JSON.parse(calls[0].prompt);
  assert.deepEqual(sent.earlierBooksToRecap.map((b: { title: string }) => b.title), ["Book One"]);
  assert.match(calls[0].prompt, /The heir is crowned/);
  assert.doesNotMatch(calls[0].prompt, /not this book/, "notes on the new book stay out");
  assert.deepEqual(source.saved[0].coveredWorkIds, ["w1"]);
});

// ---- Resume ----------------------------------------------------------------------------------------

test("a paused book, or one untouched for two weeks, gets the prompt; a recent one only the action", () => {
  const w = work("w1");
  const paused = recapOptions({ book: book({ status: "PAUSED" }), work: w, finishedInSeries: [] }, NOW).resume;
  assert.equal(paused?.reason, "paused");
  assert.equal(paused?.prompt, true);
  const stale = recapOptions({ book: book({ status: "STARTED", progressAt: daysAgo(STALE_DAYS) }), work: w, finishedInSeries: [] }, NOW).resume;
  assert.equal(stale?.reason, "stale");
  const recent = recapOptions({ book: book({ status: "STARTED", progressAt: daysAgo(3) }), work: w, finishedInSeries: [] }, NOW).resume;
  assert.equal(recent?.reason, null);
  assert.equal(recent?.prompt, false);
  // No progress update recorded yet: started long ago counts as untouched.
  const old = recapOptions({ book: book({ status: "STARTED", progressAt: null, startedAt: daysAgo(30) }), work: w, finishedInSeries: [] }, NOW).resume;
  assert.equal(old?.reason, "stale");
  // Too early to have anything to recap.
  assert.equal(recapOptions({ book: book({ currentPage: 10 }), work: w, finishedInSeries: [] }, NOW).resume, null);
});

test("the resume recap is bounded by the bucket below the reader's percent, audiobooks included", () => {
  assert.equal(recapBucket(47.1), 45);
  assert.equal(recapBucket(45), 45);
  assert.equal(recapBucket(4.9), 0);
  const listening = book({ progressUnit: "MINUTES", audioMinutes: 600, currentMinute: 250, pages: 0, currentPage: 0 });
  const resume = recapOptions({ book: listening, work: work("w1"), finishedInSeries: [] }, NOW).resume;
  assert.equal(resume?.percent, 41.7);
  assert.equal(resume?.bound, 40);
  assert.equal(resume!.bound % RECAP_BUCKET, 0);
});

test("a recap whose reported point is past the reader's is thrown away and refunded", async () => {
  const source = memorySource({ book: book(), work: work("w1"), finishedInSeries: [] });
  const { ask, calls } = fakeModel(goodAnswer(62));
  const d = deps(ask, source);
  const result = await catchMeUp(reader, "book1", "RESUME", d);
  assert.equal(result.status, "failed");
  assert.equal(result.status === "failed" && result.reason, "overreach");
  assert.equal(recapsUsed(d.store), 0, "refunded");
  assert.equal(source.saved.length, 0, "nothing kept");
  // The reader is at 47%: the model was told 45% and to stop there.
  const sent = JSON.parse(calls[0].prompt);
  assert.equal(sent.readerHasReadUpTo, "45%");
  assert.match(calls[0].system, /hard limit/);

  // A missing point counts as past it too.
  const missing = await catchMeUp(reader, "book1", "RESUME", deps(fakeModel({ confident: true, paragraphs: [WORDS(150)] }).ask, source));
  assert.equal(missing.status === "failed" && missing.reason, "overreach");
});

test("a recap that stops at or before the reader's point is kept and spends one recap", async () => {
  const source = memorySource({ book: book(), work: work("w1"), finishedInSeries: [] });
  const d = deps(fakeModel(goodAnswer(45)).ask, source);
  const result = await catchMeUp(reader, "book1", "RESUME", d);
  assert.equal(result.status, "ready");
  assert.equal(result.status === "ready" && result.left, 2);
  assert.equal(recapsUsed(d.store), 1);
  assert.equal(source.saved[0].reachedPercent, 45);
  assert.equal(source.saved[0].bucket, 45);
});

test("a thin answer is refunded, not kept", async () => {
  const source = memorySource({ book: book(), work: work("w1"), finishedInSeries: [] });
  const d = deps(fakeModel({ confident: true, paragraphs: ["Too short."], furthestPercent: 30 }).ask, source);
  const result = await catchMeUp(reader, "book1", "RESUME", d);
  assert.equal(result.status === "failed" && result.reason, "thin");
  assert.equal(recapsUsed(d.store), 0);
});

// ---- Circle comments through the spoiler lock ---------------------------------------------------------

function comment(id: string, userId: string, position: number, body: string, extra: Partial<CommentRow> = {}): CommentRow {
  return { id, userId, position, pageLabel: null, chapterLabel: null, body, parentId: null, createdAt: NOW, editedAt: null, deletedAt: null, reactions: [], ...extra };
}

const author = (name: string): CommentAuthor => ({ username: name, image: null, favColour: null });

test("only circle comments unlocked for the reader, and before the recap's bound, reach the prompt", async () => {
  // The reader is at 47% (160 of 340 pages); the recap stops at 45%.
  const rows = [
    comment("c1", "friend", 10, "EARLY: the ship leaves port"),
    comment("c2", "friend", 44, "BEFORE BOUND: the storm hits"),
    comment("c3", "friend", 46, "PAST BOUND: unlocked but past 45"),
    comment("c4", "friend", 80, "LOCKED: the captain dies"),
    comment("c5", "friend", 80, "LOCKED REPLY: no way", { parentId: "c4" }),
    comment("c6", "reader", 90, "OWN AHEAD: from my first read"),
    comment("c7", "blocked", 5, "BLOCKED: hidden author"),
    comment("c8", "friend", 20, "DELETED", { deletedAt: NOW }),
  ];
  const authors = new Map([["friend", author("friend")], ["reader", author("reader")]]);
  const threads: CircleThread[] = [{ bookId: "book1", rows, authors }];

  // The pure step first.
  const kept = unlockedComments(threads, "reader", new Map([["book1", 47]]), new Map([["book1", 45]]));
  assert.deepEqual(kept.map((c) => c.text), ["EARLY: the ship leaves port", "BEFORE BOUND: the storm hits"]);

  // And what the model is actually sent.
  const source = memorySource({ book: book(), work: work("w1"), finishedInSeries: [] }, { threads, notes: [{ bookId: "book1", title: "Ch 3", content: "MY NOTE: the map is fake" }] });
  const { ask, calls } = fakeModel(goodAnswer(40));
  await catchMeUp(reader, "book1", "RESUME", deps(ask, source));
  const prompt = calls[0].prompt;
  assert.match(prompt, /MY NOTE: the map is fake/);
  assert.match(prompt, /EARLY: the ship leaves port/);
  assert.match(prompt, /BEFORE BOUND: the storm hits/);
  for (const hidden of ["PAST BOUND", "LOCKED", "OWN AHEAD", "BLOCKED", "DELETED", "friend"]) {
    assert.doesNotMatch(prompt, new RegExp(hidden), `${hidden} must not reach the model`);
  }
});

// ---- Popularity gate and "not confident" ---------------------------------------------------------------

test("only well-known works get the button", async () => {
  assert.equal(isWellKnown(POPULAR), true);
  assert.equal(isWellKnown(OBSCURE), false);
  assert.equal(isWellKnown({ bookmarkReaders: WELL_KNOWN.bookmarkReaders, olEditions: null, olRatings: null, olReadingLog: null }), true, "Bookmark readers alone can pass");
  assert.equal(isWellKnown({ bookmarkReaders: 0, olEditions: null, olRatings: null, olReadingLog: WELL_KNOWN.olReadingLog - 1 }), false);

  const source = memorySource({ book: book(), work: work("w1", { popularity: OBSCURE }), finishedInSeries: [] });
  assert.equal(recapOptions(await source.context("reader", "book1") as RecapContext, NOW).resume, null);
  const { ask, calls } = fakeModel(goodAnswer(40));
  const d = deps(ask, source);
  assert.equal((await catchMeUp(reader, "book1", "RESUME", d)).status, "not_eligible");
  assert.equal(calls.length, 0);
  assert.equal(recapsUsed(d.store), 0);
  // A book that isn't in the catalog has no recaps either.
  assert.equal((await catchMeUp(reader, "book1", "RESUME", deps(ask, memorySource({ book: book(), work: null, finishedInSeries: [] })))).status, "not_eligible");
});

test("'not confident' is refunded, kept, and asking again doesn't call the model", async () => {
  const source = memorySource({ book: book(), work: work("w1"), finishedInSeries: [] });
  const { ask, calls } = fakeModel({ confident: false, paragraphs: [], furthestPercent: 0 });
  const d = deps(ask, source);
  const first = await catchMeUp(reader, "book1", "RESUME", d);
  assert.equal(first.status, "not_confident");
  assert.equal(first.status === "not_confident" && first.left, 3);
  assert.equal(recapsUsed(d.store), 0, "refunded");
  const again = await catchMeUp(reader, "book1", "RESUME", d);
  assert.equal(again.status, "not_confident");
  assert.equal(calls.length, 1);
  assert.equal(recapsUsed(d.store), 0);
});

test("a failed model call is refunded", async () => {
  const source = memorySource({ book: book(), work: work("w1"), finishedInSeries: [] });
  const ask: AskJson = async () => { throw new AiError("request", "overloaded"); };
  const d = deps(ask, source);
  const result = await catchMeUp(reader, "book1", "RESUME", d);
  assert.equal(result.status === "failed" && result.reason, "error");
  assert.equal(recapsUsed(d.store), 0);
});

// ---- Cache and allowance -----------------------------------------------------------------------------

test("reopening a recap is free, even with the month's allowance used up", async () => {
  const source = memorySource({ book: book(), work: work("w1"), finishedInSeries: [] });
  const { ask, calls } = fakeModel(goodAnswer(40));
  const d = deps(ask, source);
  const first = await catchMeUp(reader, "book1", "RESUME", d);
  assert.equal(first.status, "ready");
  assert.equal(recapsUsed(d.store), 1);
  // Use the rest of the free allowance.
  d.store.rows.set(`reader|recaps|${monthKey(NOW, "Europe/London")}`, 3);
  const again = await catchMeUp(reader, "book1", "RESUME", d);
  assert.equal(again.status, "ready");
  assert.equal(again.status === "ready" && again.cached, true);
  assert.equal(calls.length, 1);
  assert.equal(recapsUsed(d.store), 3);
  // recapState hands the kept recap to the book page without spending anything.
  const state = await recapState(reader, "book1", { source, available: () => true, now: NOW });
  assert.equal(state.enabled && state.resume?.recap?.id, first.status === "ready" ? first.recap.id : null);
});

test("a free account's fourth recap is refused with the upgrade, without calling the model", async () => {
  const store = memoryUsageStore();
  const { ask, calls } = fakeModel(goodAnswer(10));
  for (const [i, pages] of [[1, 40], [2, 80], [3, 120], [4, 200]] as const) {
    const source = memorySource({ book: book({ id: `book${i}`, currentPage: pages }), work: work(`w${i}`), finishedInSeries: [] });
    const result = await catchMeUp(reader, `book${i}`, "RESUME", deps(ask, source, store));
    if (i < 4) assert.equal(result.status, "ready", `recap ${i}`);
    else assert.equal(result.status, "allowance");
  }
  assert.equal(calls.length, 3);
});

// ---- Preference and no key ------------------------------------------------------------------------------

test("switching showRecaps off turns the feature off", async () => {
  assert.equal(preferencesOf({}).showRecaps, true, "on by default");
  const off = { id: "reader", showRecaps: preferencesOf({ showRecaps: false }).showRecaps };
  const source = memorySource({ book: book(), work: work("w1"), finishedInSeries: [] });
  const { ask, calls } = fakeModel(goodAnswer(40));
  const d = deps(ask, source);
  assert.equal((await catchMeUp(off, "book1", "RESUME", d)).status, "off");
  assert.deepEqual(await recapState(off, "book1", { source, available: () => true, now: NOW }), { enabled: false });
  assert.equal(calls.length, 0);
  assert.equal(recapsUsed(d.store), 0);
});

test("with no API key, recaps skip cleanly: nothing spent, and the real client never makes a request", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert.equal(aiAvailable(), false);
    const source = memorySource({ book: book(), work: work("w1"), finishedInSeries: [] });
    const store = memoryUsageStore();
    const result = await catchMeUp(reader, "book1", "RESUME", { ask: askJson, source, available: aiAvailable, usage: { store, account: freeAccount, now: NOW }, now: NOW });
    assert.equal(result.status, "unavailable");
    assert.equal(store.rows.size, 0);
    const state = await recapState(reader, "book1", { source, available: aiAvailable, now: NOW });
    assert.equal(state.enabled && state.available, false);
    await assert.rejects(askJson({ system: "", prompt: "", schema: {}, maxTokens: 1 }), (err: unknown) => err instanceof AiError && err.kind === "unavailable");
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});
