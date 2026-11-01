// The stats explorer (BOO-82, Plus): ranges and their presets, comparisons, the filters, the sums, the
// address a saved view keeps, the CSV and the range card's words. Also the gate: Plus has it, free doesn't,
// and nothing that's free today moves. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/statsExplorer.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_FILTERS,
  chartFileName,
  chartRows,
  compareRange,
  csvCell,
  csvOf,
  explore,
  explorePeriod,
  explorerSearch,
  parseExplorerQuery,
  presetRange,
  rangeCardTitle,
  rangeDays,
  rangeLabel,
  type ExplorerFinish,
  type ExplorerQuery,
} from "@bookmark/shared/statsExplorer";
import { cardFileName, cardPath, cardWords } from "@bookmark/shared/wrapCards";
import { entitlementsOf } from "@bookmark/shared/entitlements";

const TODAY = "2026-10-31";

let n = 0;
function finish(over: Partial<ExplorerFinish>): ExplorerFinish {
  n++;
  return {
    bookId: `b${n}`,
    title: `Book ${n}`,
    author: "Ursula K. Le Guin",
    genre: "Fantasy",
    format: "PRINT",
    outcome: "COMPLETED",
    day: "2026-03-10",
    pages: 300,
    minutes: 0,
    rating: 4,
    moods: [],
    spice: null,
    reread: false,
    ...over,
  };
}

const SHELF: ExplorerFinish[] = [
  finish({ bookId: "earthsea", day: "2026-01-05", rating: 4.75, moods: ["ADVENTUROUS"], spice: 0 }),
  finish({ bookId: "earthsea", day: "2026-06-20", reread: true, rating: 5, moods: ["ADVENTUROUS"], spice: 0 }),
  finish({ author: "N. K. Jemisin", genre: "Science fiction", format: "AUDIOBOOK", pages: 0, minutes: 900, day: "2026-06-02", moods: ["DARK"], spice: 2 }),
  finish({ author: "ursula k. le guin", genre: "fantasy", format: "EBOOK", day: "2026-08-31", spice: 3 }),
  finish({ outcome: "DNF", day: "2026-07-01", genre: "Romance", author: "Someone Else" }),
  finish({ day: "2025-06-15", genre: "Fantasy" }),
  finish({ day: null }),
]

test("presets count from the reader's own today", () => {
  assert.deepEqual(presetRange("thisYear", TODAY), { from: "2026-01-01", to: TODAY });
  assert.deepEqual(presetRange("lastYear", TODAY), { from: "2025-01-01", to: "2025-12-31" });
  assert.deepEqual(presetRange("last12Months", TODAY), { from: "2025-11-01", to: TODAY });
  assert.deepEqual(presetRange("thisMonth", TODAY), { from: "2026-10-01", to: TODAY });
  assert.deepEqual(presetRange("lastMonth", "2026-01-15"), { from: "2025-12-01", to: "2025-12-31" });
  assert.equal(rangeDays(presetRange("last90Days", TODAY)), 90);
});

test("comparisons: the period before, whole months stay whole, and a year back", () => {
  assert.deepEqual(compareRange("previous", { from: "2026-06-01", to: "2026-08-31" }), { from: "2026-03-01", to: "2026-05-31" });
  assert.deepEqual(compareRange("previous", { from: "2026-06-10", to: "2026-06-19" }), { from: "2026-05-31", to: "2026-06-09" });
  assert.deepEqual(compareRange("lastYear", { from: "2024-02-29", to: "2024-03-31" }), { from: "2023-02-28", to: "2023-03-31" });
  assert.deepEqual(compareRange("previous", { from: "2026-01-01", to: "2026-12-31" }), { from: "2025-01-01", to: "2025-12-31" });
});

test("a query survives the address, and a saved view, unchanged", () => {
  const query: ExplorerQuery = {
    range: { from: "2026-01-01", to: "2026-10-31" },
    compare: { from: "2025-01-01", to: "2025-10-31" },
    filters: { formats: ["AUDIOBOOK", "EBOOK"], genres: ["Science fiction", "Fantasy, epic"], moods: ["DARK"], spice: [2, 3], authors: ["N. K. Jemisin"], rereads: "firsts" },
  };
  const parsed = parseExplorerQuery(new URLSearchParams(explorerSearch(query)), TODAY);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.query, query);
});

test("bad addresses are refused in plain words; unknown filter values are dropped", () => {
  const bad = (q: string) => {
    const r = parseExplorerQuery(new URLSearchParams(q), TODAY);
    return r.ok ? null : r.error;
  };
  assert.match(bad("from=2026-02-30&to=2026-03-01")!, /start and an end/);
  assert.match(bad("from=2026-05-01&to=2026-04-01")!, /before the end/);
  assert.match(bad("from=1999-12-31&to=2026-01-01")!, /2000/);
  assert.match(bad("from=2027-01-01&to=2027-02-01")!, /already started/);
  assert.match(bad("from=2026-01-01&to=2026-02-01&cfrom=2025-01-01")!, /^Comparison:/);
  const loose = parseExplorerQuery(new URLSearchParams("format=VINYL,EBOOK&mood=grumpy,dark&spice=9,1&reads=sometimes"), TODAY);
  assert.ok(loose.ok);
  assert.deepEqual(loose.query.range, presetRange("thisYear", TODAY));
  assert.deepEqual(loose.query.filters, { ...NO_FILTERS, formats: ["EBOOK"], moods: ["DARK"], spice: [1] });
});

test("a range counts its dated finishes; undated ones fall in no range", () => {
  const p = explorePeriod(SHELF, { from: "2026-01-01", to: "2026-12-31" }, NO_FILTERS);
  assert.equal(p.finishes, 4);
  assert.equal(p.books, 3);
  assert.equal(p.rereads, 1);
  assert.equal(p.pages, 900);
  assert.equal(p.minutes, 900);
  assert.equal(p.dnf, 1);
  assert.equal(p.dnfRate, 1 / 5);
  assert.equal(p.label, "2026");
  assert.equal(p.timeline.length, 12);
  assert.equal(p.timeline[5].books, 2);
  // Authors and genres match whatever the case.
  assert.deepEqual(p.authors[0], { name: "Ursula K. Le Guin", count: 3 });
  assert.deepEqual(p.genres[0], { name: "Fantasy", count: 3 });
  assert.deepEqual(p.formats.map((f) => f.count), [2, 1, 1]);
  assert.equal(p.spice.find((s) => s.name === "0")!.count, 2);
  // 4¾ counts with the fours.
  assert.deepEqual(p.ratings.map((r) => r.count), [0, 0, 0, 3, 1]);
  assert.equal(explore(SHELF, { range: presetRange("allTime", TODAY), compare: null, filters: NO_FILTERS }).options.undated, 1);
});

test("filters: any value within one, all of them across", () => {
  const range = { from: "2026-01-01", to: "2026-12-31" };
  const count = (patch: Partial<typeof NO_FILTERS>) => explorePeriod(SHELF, range, { ...NO_FILTERS, ...patch }).finishes;
  assert.equal(count({ formats: ["AUDIOBOOK"] }), 1);
  assert.equal(count({ formats: ["AUDIOBOOK", "EBOOK"] }), 2);
  assert.equal(count({ genres: ["FANTASY"] }), 3);
  assert.equal(count({ authors: ["n. k. jemisin"] }), 1);
  assert.equal(count({ moods: ["ADVENTUROUS", "DARK"] }), 3);
  assert.equal(count({ spice: [2, 3] }), 2);
  assert.equal(count({ rereads: "rereads" }), 1);
  assert.equal(count({ rereads: "firsts" }), 3);
  assert.equal(count({ genres: ["Fantasy"], formats: ["EBOOK"] }), 1);
  // A spice filter leaves out books with no spice reported.
  assert.equal(explorePeriod(SHELF, range, { ...NO_FILTERS, spice: [0, 1, 2, 3, 4, 5] }).finishes, 4);
});

test("two periods side by side, and a short range counted by day", () => {
  const r = explore(SHELF, { range: { from: "2026-06-01", to: "2026-06-30" }, compare: compareRange("lastYear", { from: "2026-06-01", to: "2026-06-30" }), filters: NO_FILTERS });
  assert.equal(r.period.finishes, 2);
  assert.equal(r.compare!.finishes, 1);
  assert.equal(r.period.timeline.length, 30);
  assert.equal(r.period.label, "June 2026");
  assert.equal(r.compare!.label, "June 2025");
});

test("labels and range card titles read naturally", () => {
  assert.equal(rangeLabel({ from: "2026-06-01", to: "2026-08-31" }), "June – August 2026");
  assert.equal(rangeLabel({ from: "2025-12-12", to: "2026-01-03" }), "12 December 2025 – 3 January 2026");
  assert.equal(rangeLabel({ from: "2026-03-04", to: "2026-03-20" }), "4 March – 20 March 2026");
  assert.equal(rangeCardTitle({ from: "2026-06-01", to: "2026-08-31" }), "My June to August in books");
  assert.equal(rangeCardTitle({ from: "2025-11-01", to: "2026-02-28" }), "My Nov 2025 to Feb 2026 in books");
  assert.equal(rangeCardTitle({ from: "2026-03-04", to: "2026-04-17" }), "My 45 days in books");
  assert.deepEqual(cardWords({ year: 2026, month: null, isCurrent: false, range: { from: "2026-06-01", to: "2026-08-31" } }), { title: "My June to August in books", kicker: "June – August 2026" });
  // A year or month card says what it always said.
  assert.deepEqual(cardWords({ year: 2026, month: 9, isCurrent: true }), { title: "My October in books", kicker: "October 2026" });
});

test("range cards get their own address and file name; year and month cards are unchanged", () => {
  assert.equal(cardPath({ kind: "grid", size: "story", design: "midnight", range: { from: "2026-06-01", to: "2026-08-31" } }), "/api/wrap/card?kind=grid&size=story&design=midnight&from=2026-06-01&to=2026-08-31");
  assert.equal(cardPath({ kind: "grid", size: "story", design: "midnight", year: 2026, month: 10 }), "/api/wrap/card?kind=grid&size=story&design=midnight&year=2026&month=10");
  assert.equal(cardFileName({ kind: "stats", size: "square", range: { from: "2026-06-01", to: "2026-08-31" } }), "bookmark-stats-2026-06-01-to-2026-08-31-square");
  assert.equal(cardFileName({ kind: "grid", size: "story", year: 2026, month: 10 }), "bookmark-grid-2026-10-story");
});

test("a chart's CSV: one row per label, a column per period, and cells a spreadsheet can't run", () => {
  const r = explore(SHELF, { range: { from: "2026-01-01", to: "2026-12-31" }, compare: { from: "2025-01-01", to: "2025-12-31" }, filters: NO_FILTERS });
  assert.deepEqual(chartRows(r, "genres"), [["Genre", "2026", "2025"], ["Fantasy", 3, 1], ["Science fiction", 1, 0]]);
  assert.equal(chartRows(r, "timeline")[0].length, 8);
  assert.equal(csvCell('Say "hi", then'), '"Say ""hi"", then"');
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell(-3), "-3");
  assert.equal(csvOf([["a", 1], ["b", null]]), "a,1\r\nb,\r\n");
  assert.equal(chartFileName("genres", { from: "2026-01-01", to: "2026-12-31" }), "bookmark-genres-2026-01-01-to-2026-12-31.csv");
});

// The rule: Plus adds ways to explore, never the stats themselves. Free keeps everything it had.
test("the explorer is Plus, and nothing free moves", () => {
  const free = entitlementsOf({ plan: "FREE" });
  const plus = entitlementsOf({ plan: "PLUS" });
  assert.equal(free.statsExplorer, false);
  assert.equal(plus.statsExplorer, true);
  // The keys that were gated before BOO-82, and only those, plus this one and big clubs (BOO-79, a host gate).
  assert.deepEqual(Object.keys(free).filter((k) => typeof (free as unknown as Record<string, unknown>)[k] === "boolean" && k !== "isPlus").sort(), ["bigClubs", "canHostUnlimited", "customWrapDesigns", "extraGoalTypes", "statsExplorer"]);
});
