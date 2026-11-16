// Moods, content warnings and spice: the submission rules, the aggregate a book page shows, the StoryGraph
// mapping, and the host-one-circle rule. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/workTags.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MOODS, MOODS_MAX, MOOD_FLOOR_READERS, aggregateTags, focusFromStoryGraph, shownMoods, moodsFromStoryGraph, paceFromStoryGraph,
  parseWarnings, readerTagsSchema, readsLike, spiceAskable, spiceApplies, spiceMedian,
} from "@/lib/workTags";
import { hostingAllowance, inheritedAllowance } from "@/lib/buddyReads";

test("the mood set is StoryGraph's twelve", () => {
  assert.equal(MOODS.length, 12);
  assert.deepEqual(moodsFromStoryGraph("adventurous, dark, tense"), ["ADVENTUROUS", "DARK", "TENSE"]);
  // Case, spacing and words StoryGraph doesn't use.
  assert.deepEqual(moodsFromStoryGraph(" Emotional ;Funny, cosy, emotional"), ["EMOTIONAL", "FUNNY"]);
  assert.deepEqual(moodsFromStoryGraph(""), []);
  assert.deepEqual(moodsFromStoryGraph(null), []);
  assert.equal(moodsFromStoryGraph(MOODS.map((m) => m.toLowerCase()).join(",")).length, MOODS_MAX);
});

test("a reader's tags are de-duplicated, capped and one level per topic", () => {
  const parsed = readerTagsSchema.safeParse({
    moods: ["DARK", "DARK", "TENSE"],
    warnings: [{ topic: "Grief", level: "MINOR" }, { topic: "Grief", level: "GRAPHIC" }],
  });
  assert.ok(parsed.success);
  assert.deepEqual(parsed.data.moods, ["DARK", "TENSE"]);
  assert.deepEqual(parsed.data.warnings, [{ topic: "Grief", level: "GRAPHIC" }]);

  assert.ok(!readerTagsSchema.safeParse({ moods: ["COSY"], warnings: [] }).success);
  assert.ok(!readerTagsSchema.safeParse({ moods: [], warnings: [{ topic: "Spiders", level: "MINOR" }] }).success);
  assert.ok(!readerTagsSchema.safeParse({ moods: ["DARK", "TENSE", "FUNNY", "HOPEFUL", "EMOTIONAL", "MYSTERIOUS"], warnings: [] }).success);
  // Stored JSON that doesn't parse is treated as no warnings rather than crashing a page.
  assert.deepEqual(parseWarnings("nope"), []);
  assert.deepEqual(parseWarnings([{ topic: "War", level: "MODERATE" }, { topic: "x" }]), []);
});

test("the aggregate counts readers, ranks moods and picks each warning's commonest level", () => {
  const rows = [
    { userId: "a", moods: ["DARK", "TENSE"], warnings: [{ topic: "Violence", level: "GRAPHIC" }, { topic: "Grief", level: "MINOR" }] },
    { userId: "b", moods: ["DARK"], warnings: [{ topic: "Violence", level: "MODERATE" }] },
    { userId: "c", moods: ["DARK", "FUNNY"], warnings: [{ topic: "Violence", level: "MODERATE" }, { topic: "Grief", level: "MODERATE" }] },
    // Nothing tagged: not a reader for the count.
    { userId: "d", moods: [], warnings: [] },
    // Unknown stored values are ignored.
    { userId: "e", moods: ["SPOOKY"], warnings: null },
  ];
  const agg = aggregateTags(rows, "c");
  assert.equal(agg.readers, 3);
  // Ties fall back to the fixed mood order.
  assert.deepEqual(agg.moods.map((m) => [m.mood, m.count]), [["DARK", 3], ["FUNNY", 1], ["TENSE", 1]]);
  assert.equal(agg.moods[0].share, 1);
  // Violence: two moderate, one graphic → moderate. Grief: one minor, one moderate → tie goes to the more serious.
  assert.deepEqual(agg.warnings.map((w) => [w.topic, w.level, w.count]), [["Violence", "MODERATE", 3], ["Grief", "MODERATE", 2]]);
  assert.deepEqual(agg.mine, { moods: ["DARK", "FUNNY"], warnings: [{ topic: "Violence", level: "MODERATE" }, { topic: "Grief", level: "MODERATE" }], spice: null, pace: null, focus: null, cliffhanger: null });
  assert.equal(aggregateTags(rows, "zz").mine, null);
  assert.equal(aggregateTags([]).readers, 0);
});

test("a mood needs a tenth of the taggers to show once a book has ten", () => {
  const rows = (n: number, moods: string[]) => Array.from({ length: n }, (_, i) => ({ userId: `${moods.join()}${i}`, moods, warnings: [] }))
  // Small books: every mood counts.
  const small = aggregateTags([...rows(3, ["TENSE"]), ...rows(1, ["FUNNY"])])
  assert.deepEqual(shownMoods(small.moods, small.readers, 6).map((m) => m.mood), ["TENSE", "FUNNY"])
  // 1,000 taggers: a stray 2 don't show, 10% does, and the cap still applies.
  const big = aggregateTags([...rows(898, ["TENSE", "DARK"]), ...rows(100, ["MYSTERIOUS"]), ...rows(2, ["FUNNY"])])
  assert.ok(big.readers >= MOOD_FLOOR_READERS)
  assert.deepEqual(shownMoods(big.moods, big.readers, 6).map((m) => m.mood), ["DARK", "TENSE", "MYSTERIOUS"])
  assert.deepEqual(shownMoods(big.moods, big.readers, 2).map((m) => m.mood), ["DARK", "TENSE"])
  assert.equal(big.moods.length, 4, "the aggregate itself keeps every mood")
})

test("spice is a whole number from 0 to 5, or cleared", () => {
  assert.equal(readerTagsSchema.parse({ moods: [], warnings: [], spice: 0 }).spice, 0);
  assert.equal(readerTagsSchema.parse({ moods: [], warnings: [], spice: null }).spice, null);
  // Left out by a client that doesn't edit it.
  assert.equal(readerTagsSchema.parse({ moods: [], warnings: [] }).spice, undefined);
  for (const bad of [6, -1, 2.5, "3"]) assert.ok(!readerTagsSchema.safeParse({ moods: [], warnings: [], spice: bad }).success, String(bad));
});

test("a book's spice is the median, shown once five readers have reported it", () => {
  const rows = (levels: (number | null)[]) => levels.map((spice, i) => ({ userId: `r${i}`, moods: [], warnings: [], spice }));
  // Four reports: counted, not shown.
  const few = aggregateTags(rows([4, 4, 4, 4]));
  assert.deepEqual(few.spice, { level: null, early: 4, reports: 4 });
  assert.equal(few.readers, 4, "a spice-only report still makes a tagger");
  assert.deepEqual(aggregateTags(rows([4, 4, 4, 4, 4])).spice, { level: 4, early: null, reports: 5 });
  // Unreported and out-of-range stored values don't count.
  assert.deepEqual(aggregateTags(rows([3, 3, 3, 3, null, 9])).spice, { level: null, early: 3, reports: 4 });
  // Two middles round up.
  assert.equal(spiceMedian([1, 2, 3, 4]), 3);
  assert.equal(spiceMedian([2, 2, 3, 3, 3, 3]), 3);
  assert.equal(spiceMedian([]), null);
  assert.equal(aggregateTags(rows([1, 2]), "r1").mine?.spice, 2);
});

test("one reader can't move a book's spice on their own", () => {
  const rows = (levels: number[]) => levels.map((spice, i) => ({ userId: `r${i}`, moods: [], warnings: [], spice }));
  const settled = [2, 2, 3, 3, 3, 3, 4];
  assert.equal(aggregateTags(rows(settled)).spice.level, 3);
  // An outlier at either end, or one reader changing their mind to the extreme, leaves it where it is.
  for (const extra of [0, 5]) assert.equal(aggregateTags(rows([...settled, extra])).spice.level, 3, `adding ${extra}`);
  for (let i = 0; i < settled.length; i++) {
    for (const to of [0, 5]) {
      const changed = settled.map((v, j) => (j === i ? to : v));
      assert.equal(aggregateTags(rows(changed)).spice.level, 3, `reader ${i} → ${to}`);
    }
  }
  // Below the threshold one reader is never enough to show a number, early or settled.
  assert.deepEqual(aggregateTags(rows([5])).spice, { level: null, early: null, reports: 1 });
  // Two or more give an early reading, still not the settled level; two middles round up.
  assert.deepEqual(aggregateTags(rows([3, 5])).spice, { level: null, early: 4, reports: 2 });
});

test("free accounts host one active circle at a time", () => {
  assert.deepEqual(hostingAllowance(0), { allowed: true, active: 0, limit: 1, plan: "free", upgrade: false, message: null });
  const blocked = hostingAllowance(1);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.limit, 1);
  assert.match(blocked.message ?? "", /already hosting an active circle/);
  assert.match(blocked.message ?? "", /Joining circles is never limited/);
  assert.equal(hostingAllowance(5).allowed, false);
});

test("circles handed on have their own cap: five on free, none on Plus", () => {
  assert.equal(inheritedAllowance(4).allowed, true);
  const full = inheritedAllowance(5);
  assert.equal(full.allowed, false);
  assert.equal(full.limit, 5);
  assert.equal(full.upgrade, true);
  assert.match(full.message ?? "", /five active circles handed on to you/);
  assert.equal(inheritedAllowance(50, "plus").allowed, true);
  assert.equal(inheritedAllowance(50, "plus").limit, null);
});

test("spice applies to romance, romantasy and books flagged for sexual content, not to everything", () => {
  assert.ok(spiceApplies({ subjects: ["Fiction", "Love stories"] }, []));
  assert.ok(spiceApplies({ subjects: ["Romantasy"] }, []));
  // Haunting Adeline: dark romance shelved among thriller and horror.
  assert.ok(spiceApplies({ subjects: ["Dark Romance", "Stalker", "Thriller", "Horror"] }, []));
  assert.ok(spiceApplies({ subjects: ["fiction, romance, contemporary"] }, []));
  assert.ok(spiceApplies({ subjects: ["Historical fiction"], genres: ["Romance"] }, []), "a reader's genre counts");
  assert.ok(spiceApplies({ subjects: [], genres: [null, "Thriller", "Dark romance"] }, []), "a work Open Library left bare");
  assert.ok(spiceApplies({ subjects: ["Fantasy", "Dragons"] }, [{ topic: "Sexual content" }]), "romantasy filed as fantasy");
  assert.ok(!spiceApplies({ subjects: ["Science fiction", "Space opera"], genres: ["Sci-Fi"] }, [{ topic: "Violence" }]));
  assert.ok(!spiceApplies({ subjects: ["Cooking"] }, []));
  assert.ok(!spiceApplies(undefined, []));

  const rows = (warnings: { topic: string, level: string }[]) => [{ userId: "a", moods: ["DARK"], warnings }];
  assert.equal(aggregateTags(rows([]), null, { subjects: ["Thrillers"] }).spiceApplies, false);
  assert.equal(aggregateTags(rows([{ topic: "Sexual content", level: "MODERATE" }]), null, { subjects: ["Thrillers"] }).spiceApplies, true);
  assert.equal(aggregateTags(rows([]), null, { subjects: ["Romance"] }).spiceApplies, true);
});

test("a reader is asked for spice on a book it applies to, or one they've already given it for", () => {
  const thriller = aggregateTags([{ userId: "a", moods: ["TENSE"], warnings: [] }], "a", { subjects: ["Thrillers"] });
  assert.equal(spiceAskable(thriller, []), false);
  assert.equal(spiceAskable(thriller, [{ topic: "Sexual content" }]), true, "flagging it in the same review");
  const reported = aggregateTags([{ userId: "a", moods: [], warnings: [], spice: 2 }], "a", { subjects: ["Thrillers"] });
  assert.equal(spiceAskable(reported, []), true, "so they can clear an earlier answer");
  assert.equal(spiceAskable(undefined, []), false);
});

// ---- Pace, story focus and cliffhanger (BOO-104) ---------------------------------------------

const answers = (rows: { pace?: string | null; focus?: string | null; cliffhanger?: boolean | null }[]) =>
  aggregateTags(rows.map((r, i) => ({ userId: `r${i}`, moods: [], warnings: [], ...r })), "r0");

test("pace, focus and cliffhanger are optional, so an older client leaves them alone", () => {
  const old = readerTagsSchema.parse({ moods: [], warnings: [], spice: 2 });
  assert.equal(old.pace, undefined);
  assert.equal(old.focus, undefined);
  assert.equal(old.cliffhanger, undefined);
  const cleared = readerTagsSchema.parse({ moods: [], warnings: [], pace: null, focus: null, cliffhanger: null });
  assert.equal(cleared.pace, null);
  assert.equal(readerTagsSchema.parse({ moods: [], warnings: [], pace: "FAST", focus: "MIX", cliffhanger: true }).focus, "MIX");
  assert.equal(readerTagsSchema.safeParse({ moods: [], warnings: [], pace: "speedy" }).success, false);
});

test("an answer alone makes a reader, and the viewer's own answers come back", () => {
  const agg = answers([{ pace: "FAST", cliffhanger: false }, { focus: "PLOT" }, {}]);
  assert.equal(agg.readers, 2, "a row with nothing in it isn't a reader");
  assert.deepEqual(agg.mine, { moods: [], warnings: [], spice: null, pace: "FAST", focus: null, cliffhanger: false });
  assert.equal(agg.pace.counts.FAST, 1);
  assert.equal(agg.cliffhanger.counts.no, 1);
});

test("pace is the middle answer, shown from five readers and early from two", () => {
  assert.equal(answers([{ pace: "FAST" }]).pace.early, null, "one reader alone sets nothing");
  const two = answers([{ pace: "FAST" }, { pace: "FAST" }]).pace;
  assert.deepEqual([two.value, two.early, two.reports], [null, "FAST", 2]);
  const five = answers(["SLOW", "FAST", "FAST", "FAST", "MEDIUM"].map((pace) => ({ pace }))).pace;
  assert.deepEqual([five.value, five.early], ["FAST", null]);
  // Two different middles meet at medium.
  assert.equal(answers(["SLOW", "SLOW", "FAST", "FAST"].map((pace) => ({ pace }))).pace.early, "MEDIUM");
  assert.equal(answers(["SLOW", "MEDIUM"].map((pace) => ({ pace }))).pace.early, "MEDIUM");
});

test("story focus is the commonest answer, a tie reading as a mix", () => {
  assert.equal(answers(["PLOT", "PLOT", "CHARACTER"].map((focus) => ({ focus }))).focus.early, "PLOT");
  assert.equal(answers(["PLOT", "CHARACTER"].map((focus) => ({ focus }))).focus.early, "MIX");
});

test("a cliffhanger tie warns, and no answers say nothing", () => {
  assert.equal(answers([{ cliffhanger: true }, { cliffhanger: false }]).cliffhanger.early, "yes");
  assert.equal(answers([{ cliffhanger: false }, { cliffhanger: false }, { cliffhanger: true }]).cliffhanger.early, "no");
  const none = answers([]);
  assert.deepEqual([none.pace.value, none.focus.value, none.cliffhanger.value, none.pace.reports], [null, null, null, 0]);
});

test("the book page line puts pace, focus and cliffhanger in order, marking early answers", () => {
  const settled = answers([...Array(5)].map(() => ({ pace: "FAST", focus: "CHARACTER", cliffhanger: true })));
  assert.deepEqual(readsLike(settled).map((p) => [p.text, p.early]), [
    ["Fast-paced", false], ["Character-driven", false], ["Ends on a cliffhanger", false],
  ]);
  const mixed = answers([...[...Array(5)].map(() => ({ pace: "SLOW" })), { cliffhanger: false }, { cliffhanger: false }]);
  assert.deepEqual(readsLike(mixed).map((p) => [p.text, p.early]), [["Slow-paced", false], ["No cliffhanger", true]]);
  assert.deepEqual(readsLike(answers([])), []);
  // An older aggregate without these fields.
  assert.deepEqual(readsLike({} as never), []);
});

test("StoryGraph's pace and story-focus columns", () => {
  assert.equal(paceFromStoryGraph("fast"), "FAST");
  assert.equal(paceFromStoryGraph(" Medium "), "MEDIUM");
  assert.equal(paceFromStoryGraph("N/A"), null);
  assert.equal(paceFromStoryGraph(""), null);
  assert.equal(focusFromStoryGraph("Character"), "CHARACTER");
  assert.equal(focusFromStoryGraph("Plot"), "PLOT");
  assert.equal(focusFromStoryGraph("A mix"), "MIX");
  assert.equal(focusFromStoryGraph("N/A"), null);
});
