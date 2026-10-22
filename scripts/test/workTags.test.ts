// Moods and content warnings: the submission rules, the aggregate a book page shows, the StoryGraph
// mapping, and the host-one-circle rule. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/workTags.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOODS, MOODS_MAX, aggregateTags, moodsFromStoryGraph, parseWarnings, readerTagsSchema } from "@/lib/workTags";
import { hostingAllowance } from "@/lib/buddyReads";

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
  assert.deepEqual(agg.mine, { moods: ["DARK", "FUNNY"], warnings: [{ topic: "Violence", level: "MODERATE" }, { topic: "Grief", level: "MODERATE" }] });
  assert.equal(aggregateTags(rows, "zz").mine, null);
  assert.equal(aggregateTags([]).readers, 0);
});

test("free accounts host one active circle at a time", () => {
  assert.deepEqual(hostingAllowance(0), { allowed: true, active: 0, limit: 1, message: null });
  const blocked = hostingAllowance(1);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.limit, 1);
  assert.match(blocked.message ?? "", /already hosting an active circle/);
  assert.match(blocked.message ?? "", /Joining circles is never limited/);
  assert.equal(hostingAllowance(5).allowed, false);
});
