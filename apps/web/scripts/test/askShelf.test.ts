// Ask the shelf and the shared AI groundwork: intent parsing against a fake model, the catalog filters
// (content warnings, the reader's shelf, length, spice, genre), friends-first ordering, book-only reasons,
// allowance metering under concurrency, the daily cost guard, and a clean skip with no API key.
// No network and no database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/askShelf.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { AiError, aiAvailable, askJson, type AskJson, type JsonRequest } from "@/lib/ai/client";
import { DAILY_AI_CAP, DAILY_FEATURE, consumeAllowance, allowanceStatus, memoryUsageStore, monthKey, usageAccountOf } from "@/lib/ai/usage";
import {
  INTENT_SCHEMA, askShelf, cleanReason, emptyIntent, parseIntent, rankCandidates, readIntent, scoreCandidate,
  type CatalogCandidate, type CatalogSource, type FriendSignal, type ShelfEntry, type ShelfIntent,
} from "@/lib/askShelf";
import { aggregateTags } from "@/lib/workTags";
import { MONTHLY_ALLOWANCES } from "@/lib/entitlements";

// ---- Fixtures ------------------------------------------------------------------------------------

type Tags = { moods?: string[]; warnings?: { topic: string; level: string }[]; spice?: number }[];

function work(id: string, fields: Partial<CatalogCandidate> & { tags?: Tags } = {}): CatalogCandidate {
  const { tags = [], ...rest } = fields;
  const agg = aggregateTags(tags.map((t, i) => ({ userId: `tagger${i}`, moods: t.moods ?? [], warnings: t.warnings ?? [], spice: t.spice ?? null })));
  return {
    workId: id, workKey: `OL${id}W`, title: `Book ${id}`, authors: ["An Author"], description: null, subjects: [],
    coverUrl: null, pages: 350, formats: ["print"], year: 2020, seriesName: null, seriesPosition: null,
    tagReaders: agg.readers, moods: agg.moods, warnings: agg.warnings, spice: agg.spice,
    ...rest,
  };
}

const intent = (fields: Partial<ShelfIntent>): ShelfIntent => ({ ...emptyIntent(), ...fields });

// A fake model: answers the intent call and the reasons call by which schema it was asked for.
function fakeModel(intentAnswer: unknown, reasons?: (req: JsonRequest) => unknown) {
  const calls: JsonRequest[] = [];
  const ask: AskJson = async (req) => {
    calls.push(req);
    const isIntent = "moods" in ((req.schema as { properties?: object }).properties ?? {});
    const data = isIntent ? intentAnswer : reasons ? reasons(req) : { reasons: [] };
    return { data, usage: { inputTokens: 0, outputTokens: 0 } };
  };
  return { ask, calls };
}

function memoryCatalog(works: CatalogCandidate[], shelf: ShelfEntry[] = [], signals = new Map<string, FriendSignal>()): CatalogSource {
  return {
    async candidates() { return works; },
    async shelf() { return shelf; },
    async signals() { return signals; },
  };
}

const ids = (results: { workId: string }[]) => results.map((r) => r.workId);

// ---- Intent ----------------------------------------------------------------------------------------

test("the intent is parsed from the model's answer, keeping only the fixed sets", async () => {
  const { ask, calls } = fakeModel({
    moods: ["LIGHTHEARTED", "HOPEFUL", "SPOOKY"],
    avoidMoods: ["DARK", "HOPEFUL"],
    pace: "slow",
    genres: ["Fantasy", "fantasy", "  Romance "],
    subjects: ["Found Family", "small towns"],
    mustHaves: ["strong female lead"],
    mustNotHaves: ["Sexual assault", "Spiders"],
    avoidSubjects: ["love triangle"],
    minPages: 450,
    maxPages: 200,
    format: "audiobook",
    rereads: false,
  });
  const parsed = await parseIntent("cosy fantasy, found family, no sexual violence", ask);

  assert.deepEqual(parsed.moods, ["LIGHTHEARTED", "HOPEFUL"]);
  // A mood can't be both wanted and avoided.
  assert.deepEqual(parsed.avoidMoods, ["DARK"]);
  assert.equal(parsed.pace, "slow");
  assert.deepEqual(parsed.genres, ["fantasy", "romance"]);
  assert.deepEqual(parsed.subjects, ["found family", "small towns"]);
  assert.deepEqual(parsed.mustNotHaves, ["Sexual assault"]);
  // Swapped into order.
  assert.equal(parsed.minPages, 200);
  assert.equal(parsed.maxPages, 450);
  assert.equal(parsed.format, "audiobook");

  // One call, with the schema and the reader's words, and the schema has nowhere to put a title.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].schema, INTENT_SCHEMA);
  assert.match(calls[0].prompt, /found family/);
  assert.ok(!Object.keys(INTENT_SCHEMA.properties).some((k) => /title|author|book/i.test(k)));
});

test("a malformed answer reads as an empty intent, not an error", () => {
  const empty = readIntent("nonsense");
  assert.deepEqual(empty, emptyIntent());
  assert.equal(readIntent({ pace: "any", format: "any", minPages: -3, maxPages: 1e9 }).maxPages, 5000);
  assert.equal(readIntent({ pace: "any" }).pace, null);
});

// ---- Filters ---------------------------------------------------------------------------------------

test("must-not-haves exclude works carrying those warnings", async () => {
  const works = [
    work("clean", { subjects: ["Fantasy", "Women heroes"] }),
    work("tagged", { subjects: ["Fantasy", "Women heroes"], tags: [{ warnings: [{ topic: "Sexual assault", level: "MODERATE" }] }] }),
    // Nobody tagged it, but its subjects say it.
    work("subject", { subjects: ["Fantasy", "Rape", "Women heroes"] }),
    // A warning the reader didn't rule out doesn't matter.
    work("other", { subjects: ["Fantasy", "Women heroes"], tags: [{ warnings: [{ topic: "War", level: "GRAPHIC" }] }] }),
  ];
  const { ask } = fakeModel({ ...emptyIntent(), genres: ["fantasy"], subjects: ["women heroes"], mustNotHaves: ["Sexual assault"], pace: "any", format: "any" });
  const { results } = await askShelf("reader", "strong female lead, fantasy, no sexual violence", { ask, catalog: memoryCatalog(works) });
  assert.deepEqual(ids(results).sort(), ["clean", "other"]);
  // The warnings still travel with the result for the card.
  assert.equal(results.find((r) => r.workId === "other")?.warnings[0].topic, "War");
});

test("length, genre and avoided themes are hard filters; unknown length stays in", () => {
  const want = intent({ genres: ["fantasy"], subjects: ["dragons"], maxPages: 400, avoidSubjects: ["love triangle"] });
  const ok = work("ok", { subjects: ["Fantasy", "Dragons"], pages: 380 });
  assert.ok(!("excluded" in scoreCandidate(want, ok)));
  assert.deepEqual(scoreCandidate(want, work("long", { subjects: ["Fantasy", "Dragons"], pages: 650 })), { excluded: "length" });
  assert.deepEqual(scoreCandidate(want, work("scifi", { subjects: ["Science fiction", "Dragons"] })), { excluded: "genre" });
  assert.deepEqual(scoreCandidate(want, work("triangle", { subjects: ["Fantasy", "Dragons", "Love triangles"] })), { excluded: "avoided" });
  const unknown = scoreCandidate(want, work("unknown", { subjects: ["Fantasy", "Dragons"], pages: null }));
  assert.ok(!("excluded" in unknown));
  // "war" is a whole word: "warm" and "award" don't match it.
  assert.deepEqual(scoreCandidate(intent({ subjects: ["war"] }), work("warm", { description: "A warm, award-winning story." })), { excluded: "irrelevant" });
});

test("spice filters by readers' median, and unknown spice stays in below the ones that fit", () => {
  const spiced = (id: string, level: number, reports = 5) =>
    work(id, { subjects: ["Fantasy", "Romance"], tags: Array.from({ length: reports }, () => ({ spice: level })) });
  const spicy = intent({ genres: ["romantasy"], minSpice: 3 });
  const hot = scoreCandidate(spicy, spiced("hot", 4));
  assert.ok(!("excluded" in hot) && hot.matched.includes("spicy spice"));
  assert.deepEqual(scoreCandidate(spicy, spiced("sweet", 1)), { excluded: "spice" });
  // Four reports isn't a median yet: the book is unknown, not excluded.
  const unknown = scoreCandidate(spicy, spiced("few", 1, 4));
  assert.ok(!("excluded" in unknown) && !("excluded" in hot) && unknown.score < hot.score);

  const clean = intent({ genres: ["romantasy"], maxSpice: 1 });
  assert.deepEqual(scoreCandidate(clean, spiced("hot", 4)), { excluded: "spice" });
  assert.ok(!("excluded" in scoreCandidate(clean, spiced("sweet", 1))));
  // No spice reported, but readers flagged graphic sexual content.
  assert.deepEqual(scoreCandidate(clean, work("flagged", { subjects: ["Fantasy", "Romance"], tags: [{ warnings: [{ topic: "Sexual content", level: "GRAPHIC" }] }] })), { excluded: "spice" });

  // The model's range is clamped, put in order, and dropped when it limits nothing.
  const read = readIntent({ pace: "any", format: "any", minSpice: 9, maxSpice: 2 });
  assert.deepEqual([read.minSpice, read.maxSpice], [2, null]);
  assert.deepEqual([readIntent({ minSpice: 0, maxSpice: 5 }).minSpice, readIntent({ minSpice: 0, maxSpice: 5 }).maxSpice], [null, null]);
  assert.ok((INTENT_SCHEMA.required as readonly string[]).includes("minSpice"));
});

test("a spice-only request still searches", async () => {
  const works = [
    work("hot", { tags: Array.from({ length: 5 }, () => ({ spice: 4 })) }),
    work("sweet", { tags: Array.from({ length: 5 }, () => ({ spice: 0 })) }),
  ];
  const { ask } = fakeModel({ ...emptyIntent(), minSpice: 4, pace: "any", format: "any" });
  const { results } = await askShelf("reader", "something really spicy", { ask, catalog: memoryCatalog(works) });
  assert.deepEqual(ids(results), ["hot"]);
  assert.equal(results[0].spice.level, 4);
});

test("romantasy needs both fantasy and romance", () => {
  const want = intent({ genres: ["romantasy"] });
  assert.ok(!("excluded" in scoreCandidate(want, work("both", { subjects: ["Fantasy", "Romance"] }))));
  assert.ok(!("excluded" in scoreCandidate(want, work("named", { subjects: ["Romantasy"] }))));
  assert.deepEqual(scoreCandidate(want, work("fantasyOnly", { subjects: ["Fantasy", "Dragons"] })), { excluded: "genre" });
});

test("readers' mood tags score, and a mood to avoid that most taggers chose excludes", () => {
  const want = intent({ moods: ["LIGHTHEARTED"], avoidMoods: ["DARK"] });
  const cosy = scoreCandidate(want, work("cosy", { tags: [{ moods: ["LIGHTHEARTED"] }, { moods: ["LIGHTHEARTED", "FUNNY"] }] }));
  assert.ok(!("excluded" in cosy) && cosy.score > 4);
  assert.deepEqual(scoreCandidate(want, work("grim", { tags: [{ moods: ["DARK", "LIGHTHEARTED"] }, { moods: ["DARK"] }] })), { excluded: "avoided" });
});

// ---- Shelf and ordering ------------------------------------------------------------------------------

test("the reader's own shelf is left out unless re-reads were asked for", async () => {
  const works = [
    work("read", { subjects: ["Dragons"] }),
    work("tbr", { subjects: ["Dragons"], workKey: "OLtbrW" }),
    work("dropped", { subjects: ["Dragons"] }),
    work("new", { subjects: ["Dragons"] }),
  ];
  const shelf: ShelfEntry[] = [
    { workId: "read", workKey: null, status: "COMPLETED" },
    // Shelved before the catalog: matched by Open Library key.
    { workId: null, workKey: "OLtbrW", status: "NOT_STARTED" },
    { workId: "dropped", workKey: null, status: "NOT_INTERESTED" },
  ];
  const base = { ...emptyIntent(), subjects: ["dragons"], pace: "any", format: "any" };

  const fresh = await askShelf("reader", "dragons", { ask: fakeModel(base).ask, catalog: memoryCatalog(works, shelf) });
  assert.deepEqual(ids(fresh.results), ["new"]);

  const rereads = await askShelf("reader", "dragons I've read before", { ask: fakeModel({ ...base, rereads: true }).ask, catalog: memoryCatalog(works, shelf) });
  // Never the ones marked "not interested".
  assert.deepEqual(ids(rereads.results).sort(), ["new", "read", "tbr"]);
});

test("friends first: followed readers' 4+ ratings, then circles, then cold matches", () => {
  const want = intent({ subjects: ["dragons", "found family"] });
  const works = [
    work("coldStrong", { subjects: ["Dragons", "Found family"] }),
    work("circle", { subjects: ["Dragons"] }),
    work("followed", { subjects: ["Dragons"] }),
    work("coldWeak", { subjects: ["Dragons"] }),
    // A friend's favourite that doesn't match the search isn't a result at all.
    work("followedOffTopic", { subjects: ["Cookery"] }),
  ];
  const friend = { username: "maya", image: null, favColour: null };
  const signals = new Map<string, FriendSignal>([
    ["followed", { kind: "followed", people: [friend], rating: 5 }],
    ["followedOffTopic", { kind: "followed", people: [friend], rating: 5 }],
    ["circle", { kind: "circle", people: [friend], count: 1, together: false }],
  ]);
  const ranked = rankCandidates(want, works, [], signals);
  assert.deepEqual(ranked.map((r) => r.candidate.workId), ["followed", "circle", "coldStrong", "coldWeak"]);
  assert.equal(ranked[0].signal?.kind, "followed");
  assert.equal(ranked[2].signal, null);
});

// ---- Reasons -----------------------------------------------------------------------------------------

test("reasons are book-only: anything about the reader or another result is dropped", async () => {
  const works = [work("a", { title: "The Ember Crown", subjects: ["Dragons"] }), work("b", { title: "Salt and Starlight", subjects: ["Dragons"] })];
  assert.equal(cleanReason("A dragon rider's slow-burn rivalry in a war college.", works[0], works), "A dragon rider's slow-burn rivalry in a war college.");
  assert.equal(cleanReason("You'll love this dragon rider's story.", works[0], works), null);
  assert.equal(cleanReason("Perfect for fans of quiet fantasy.", works[0], works), null);
  assert.equal(cleanReason("Like Salt and Starlight, but with dragons.", works[0], works), null);
  const long = cleanReason(`Dragons ${"and more dragons ".repeat(30)}`, works[0], works);
  assert.ok(long && long.length <= 221 && long.endsWith("…"));

  const base = { ...emptyIntent(), subjects: ["dragons"], pace: "any", format: "any" };
  const { ask, calls } = fakeModel(base, () => ({ reasons: [{ i: 0, reason: "Court intrigue with dragons." }, { i: 1, reason: "Your next favourite." }, { i: 7, reason: "Out of range." }] }));
  const { results, reasons } = await askShelf("reader", "dragons", { ask, catalog: memoryCatalog(works) });
  assert.equal(reasons, "done");
  assert.equal(calls.length, 2);
  // The reasons call sees the search's terms and the books, not the reader's words.
  assert.doesNotMatch(calls[1].prompt, /reader/);
  const byId = new Map(results.map((r) => [r.workId, r.reason]));
  assert.equal(byId.get(results[0].workId), "Court intrigue with dragons.");
  assert.equal(byId.get(results[1].workId), null);
});

test("a failed reasons call still returns the books; a failed intent call throws for a refund", async () => {
  const works = [work("a", { subjects: ["Dragons"] })];
  const base = { ...emptyIntent(), subjects: ["dragons"], pace: "any", format: "any" };
  let n = 0;
  const flaky: AskJson = async () => {
    if (n++ === 0) return { data: base, usage: { inputTokens: 0, outputTokens: 0 } };
    throw new AiError("request", "overloaded");
  };
  const result = await askShelf("reader", "dragons", { ask: flaky, catalog: memoryCatalog(works) });
  assert.equal(result.reasons, "failed");
  assert.deepEqual(ids(result.results), ["a"]);

  const down: AskJson = async () => { throw new AiError("request", "overloaded"); };
  await assert.rejects(askShelf("reader", "dragons", { ask: down, catalog: memoryCatalog(works) }), AiError);
});

test("a request that isn't about books searches nothing and makes no second call", async () => {
  const { ask, calls } = fakeModel({ ...emptyIntent(), pace: "any", format: "any" });
  const result = await askShelf("reader", "what's the weather", { ask, catalog: memoryCatalog([work("a", { subjects: ["Dragons"] })]) });
  assert.deepEqual(result.results, []);
  assert.equal(calls.length, 1);
});

// ---- Metering ----------------------------------------------------------------------------------------

const freeAccount = usageAccountOf({ plan: "FREE", timeZone: "Europe/London" });
const plusAccount = usageAccountOf({ plan: "PLUS", timeZone: "Europe/London" });
const NOW = new Date("2026-10-22T12:00:00Z");
const FREE_SEARCHES = MONTHLY_ALLOWANCES.askShelfSearches.free;

test("concurrent searches at the limit: only one spends the last search", async () => {
  const store = memoryUsageStore();
  // All but one used.
  store.rows.set(`u1|askShelfSearches|2026-10`, FREE_SEARCHES - 1);
  const attempts = await Promise.all(
    Array.from({ length: 10 }, () => consumeAllowance("u1", "askShelfSearches", { store, account: freeAccount, now: NOW })),
  );
  assert.equal(attempts.filter((a) => a.ok).length, 1);
  assert.ok(attempts.filter((a) => !a.ok).every((a) => !a.ok && a.reason === "allowance"));
  assert.equal(store.rows.get(`u1|askShelfSearches|2026-10`), FREE_SEARCHES);
  // The refused ones didn't touch the daily count.
  assert.equal(store.rows.get(`u1|${DAILY_FEATURE}|2026-10-22`), 1);

  // From zero, twenty at once: exactly the allowance gets through.
  const fresh = memoryUsageStore();
  const burst = await Promise.all(Array.from({ length: 20 }, () => consumeAllowance("u2", "askShelfSearches", { store: fresh, account: freeAccount, now: NOW })));
  assert.equal(burst.filter((a) => a.ok).length, FREE_SEARCHES);
  const status = await allowanceStatus("u2", "askShelfSearches", { store: fresh, account: freeAccount, now: NOW });
  assert.equal(status.left, 0);
});

test("the daily cap refuses even on Plus, and gives the monthly search back", async () => {
  const store = memoryUsageStore();
  store.rows.set(`u3|${DAILY_FEATURE}|2026-10-22`, DAILY_AI_CAP);
  const refused = await consumeAllowance("u3", "askShelfSearches", { store, account: plusAccount, now: NOW });
  assert.equal(refused.ok, false);
  assert.ok(!refused.ok && refused.reason === "daily");
  assert.equal(store.rows.get(`u3|askShelfSearches|2026-10`) ?? 0, 0);

  // The next local day it works again.
  const tomorrow = await consumeAllowance("u3", "askShelfSearches", { store, account: plusAccount, now: new Date("2026-10-23T12:00:00Z") });
  assert.equal(tomorrow.ok, true);
  assert.ok(tomorrow.ok && tomorrow.left === 99);
});

test("a refund gives back both counts, once", async () => {
  const store = memoryUsageStore();
  const spent = await consumeAllowance("u4", "askShelfSearches", { store, account: freeAccount, now: NOW });
  assert.ok(spent.ok);
  if (!spent.ok) return;
  assert.equal(spent.left, FREE_SEARCHES - 1);
  await spent.refund();
  await spent.refund();
  assert.equal(store.rows.get(`u4|askShelfSearches|2026-10`), 0);
  assert.equal(store.rows.get(`u4|${DAILY_FEATURE}|2026-10-22`), 0);
});

test("a search that finds nothing gives back the month's use but still counts towards the daily guard", async () => {
  const store = memoryUsageStore();
  const spent = await consumeAllowance("u5", "askShelfSearches", { store, account: freeAccount, now: NOW });
  assert.ok(spent.ok);
  if (!spent.ok) return;
  await spent.refund({ daily: false });
  assert.equal(store.rows.get(`u5|askShelfSearches|2026-10`), 0);
  assert.equal(store.rows.get(`u5|${DAILY_FEATURE}|2026-10-22`), 1);
});

test("months run in the reader's time zone", () => {
  // 3am UTC on 1 November is still 31 October in New York.
  const at = new Date("2026-11-01T03:00:00Z");
  assert.equal(monthKey(at, "America/New_York"), "2026-10");
  assert.equal(monthKey(at, "Europe/London"), "2026-11");
  // An unknown stored zone reads as UTC.
  assert.equal(usageAccountOf({ timeZone: "Mars/Olympus" }).timeZone, "UTC");
});

// ---- No key ------------------------------------------------------------------------------------------

test("with no API key nothing is called and the failure is a clean 'unavailable'", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert.equal(aiAvailable(), false);
    await assert.rejects(askJson({ system: "", prompt: "", schema: {}, maxTokens: 10 }), (err: unknown) => err instanceof AiError && err.kind === "unavailable");
    await assert.rejects(
      askShelf("reader", "dragons", { ask: askJson, catalog: memoryCatalog([work("a", { subjects: ["Dragons"] })]) }),
      (err: unknown) => err instanceof AiError && err.kind === "unavailable",
    );
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

test("a friend's pick that only shares the genre doesn't jump a book that is what was asked for", () => {
  const want = intent({ genres: ["fantasy"], mustHaves: ["dragons"], subjects: ["romance", "enemies to lovers"] });
  const works = [
    work("dragonsCold", { subjects: ["Fantasy", "Dragons", "Enemies to lovers"] }),
    work("friendGenreOnly", { subjects: ["Fantasy", "Romance"] }),
    work("friendDragons", { subjects: ["Fantasy", "Dragons"] }),
  ];
  const friend = { username: "maya", image: null, favColour: null };
  const signals = new Map<string, FriendSignal>([
    ["friendGenreOnly", { kind: "followed", people: [friend], rating: 5 }],
    ["friendDragons", { kind: "followed", people: [friend], rating: 4 }],
  ]);
  const ranked = rankCandidates(want, works, [], signals);
  assert.deepEqual(ranked.map((r) => r.candidate.workId), ["friendDragons", "dragonsCold", "friendGenreOnly"]);
  assert.deepEqual(ranked.map((r) => r.strong), [true, true, false]);
});

test("when some books meet a must-have, a mood match alone isn't strong", () => {
  const want = intent({ genres: ["fantasy"], mustHaves: ["dragons"], moods: ["ADVENTUROUS"] });
  const works = [
    work("dragons", { subjects: ["Fantasy", "Dragons"] }),
    work("moodOnly", { subjects: ["Fantasy"], tags: [{ moods: ["ADVENTUROUS"] }] }),
  ];
  const friend = { username: "maya", image: null, favColour: null };
  const ranked = rankCandidates(want, works, [], new Map([["moodOnly", { kind: "followed", people: [friend], rating: 5 } as FriendSignal]]));
  assert.deepEqual(ranked.map((r) => [r.candidate.workId, r.strong]), [["dragons", true], ["moodOnly", false]]);
});

test("a length-only request still searches, and keeps to the length", async () => {
  const works = [work("short", { pages: 180 }), work("long", { pages: 620 }), work("unknown", { pages: null })];
  const { ask } = fakeModel({ ...emptyIntent(), maxPages: 300, pace: "any", format: "any" });
  const { results } = await askShelf("reader", "a short read for the weekend", { ask, catalog: memoryCatalog(works) });
  assert.deepEqual(ids(results), ["short"]);
});

test("on a re-read request, the reader's own well-rated books lead and say so", () => {
  const want = intent({ subjects: ["dragons"], rereads: true });
  const works = [work("fresh", { subjects: ["Dragons"] }), work("loved", { subjects: ["Dragons"] }), work("meh", { subjects: ["Dragons"] })];
  const shelf: ShelfEntry[] = [
    { workId: "loved", workKey: null, status: "COMPLETED", rating: 5 },
    { workId: "meh", workKey: null, status: "COMPLETED", rating: 2 },
  ];
  const ranked = rankCandidates(want, works, shelf, new Map());
  assert.equal(ranked[0].candidate.workId, "loved");
  assert.deepEqual(ranked[0].shelf, { status: "COMPLETED", rating: 5 });
  assert.equal(ranked.find((r) => r.candidate.workId === "fresh")?.shelf, null);
});

test("a must-have that is only a genre word doesn't make a match strong", () => {
  const want = intent({ genres: ["fantasy"], mustHaves: ["magic", "dark academia"], subjects: ["universities"] });
  const works = [
    work("academy", { subjects: ["Fantasy", "Universities and colleges", "Magic"] }),
    work("justMagic", { subjects: ["Fantasy", "Magic"] }),
  ];
  const friend = { username: "maya", image: null, favColour: null };
  const ranked = rankCandidates(want, works, [], new Map([["justMagic", { kind: "followed", people: [friend], rating: 5 } as FriendSignal]]));
  assert.deepEqual(ranked.map((r) => [r.candidate.workId, r.strong]), [["academy", true], ["justMagic", false]]);
});

test("when no book meets any theme the reader named, mood matches are only the closest", () => {
  const want = intent({ genres: ["fantasy"], subjects: ["dark academia"], moods: ["DARK"] });
  const works = [work("moody", { subjects: ["Fantasy"], tags: [{ moods: ["DARK"] }] })];
  assert.equal(rankCandidates(want, works, [], new Map())[0].strong, false);
  // A genre-only request has nothing finer to judge by.
  assert.equal(rankCandidates(intent({ genres: ["fantasy"] }), works, [], new Map())[0].strong, true);
});
