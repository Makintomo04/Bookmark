// Seasonal quest rules: goal parsing, the staff form, genre matching and page clamping. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/quests.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookInGenre, describeGoal, parseGoal, parseQuestInput, questIdOf, questKey, questPhase, trustedPages } from "@/lib/questRules";

const form = {
  title: "Winter Doorstoppers",
  description: "Big books.",
  startsAt: "2026-12-01",
  endsAt: "2027-02-28",
  goal: { type: "pages", count: "3", minPages: 600 },
  medalColour: "#2F5D7C",
  ribbonColour: "#C9D6DF",
  medalIcon: "snowflake",
};

test("parseQuestInput builds whole UTC days and a slug from the title", () => {
  const parsed = parseQuestInput(form);
  assert.ok("data" in parsed);
  assert.equal(parsed.data.slug, "winter-doorstoppers");
  assert.equal(parsed.data.startsAt.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(parsed.data.endsAt.toISOString(), "2027-02-28T23:59:59.999Z");
  assert.deepEqual(parsed.data.goal, { type: "pages", count: 3, minPages: 600 });
  assert.equal(parsed.data.hidden, false);
});

test("parseQuestInput rejects bad windows, goals and colours", () => {
  assert.ok("error" in parseQuestInput({ ...form, endsAt: "2026-11-30" }));
  assert.ok("error" in parseQuestInput({ ...form, goal: { type: "pages", count: 0, minPages: 600 } }));
  assert.ok("error" in parseQuestInput({ ...form, goal: { type: "pages", count: 3, minPages: 9000 } }));
  assert.ok("error" in parseQuestInput({ ...form, goal: { type: "genre", count: 3, genre: "not-a-genre" } }));
  assert.ok("error" in parseQuestInput({ ...form, goal: { type: "list", count: 3, listId: "nope" } }));
  assert.ok("error" in parseQuestInput({ ...form, goal: { type: "mystery", count: 3 } }));
  assert.ok("error" in parseQuestInput({ ...form, medalColour: "red" }));
  // An unknown icon falls back rather than failing.
  const parsed = parseQuestInput({ ...form, medalIcon: "<script>" });
  assert.ok("data" in parsed && parsed.data.medalIcon === "book");
});

test("every goal type parses and reads well", () => {
  const goals = [
    { type: "list", count: 3, listId: "0123456789abcdef01234567" },
    { type: "genre", count: 2, genre: "sci-fi" },
    { type: "pages", count: 1, minPages: 600 },
    { type: "startedInWindow", count: 5 },
  ];
  const text = goals.map((g) => describeGoal(parseGoal(g)!, "Cosy Mysteries"));
  assert.deepEqual(text, [
    "Finish 3 books from “Cosy Mysteries”",
    "Finish 2 books in Sci-Fi",
    "Finish 1 book of 600+ pages",
    "Start and finish 5 books during the quest",
  ]);
});

test("free-text shelf genres match the genre loosely", () => {
  assert.ok(bookInGenre("Science Fiction", "sci-fi"));
  assert.ok(bookInGenre("sci-fi", "sci-fi"));
  assert.ok(bookInGenre("Mystery & Thriller", "mystery-thriller"));
  assert.ok(bookInGenre("crime", "mystery-thriller"));
  assert.ok(!bookInGenre("Fantasy", "sci-fi"));
  assert.ok(!bookInGenre(null, "sci-fi"));
});

test("page counts: Open Library wins, absurd counts are dropped", () => {
  assert.equal(trustedPages(9999, 320), 320);
  assert.equal(trustedPages(700, null), 700);
  assert.equal(trustedPages(5000, null), null);
  assert.equal(trustedPages(0, null), null);
});

test("quest phases and medal keys", () => {
  const q = { startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-11-30T23:59:59.999Z" };
  assert.equal(questPhase(q, new Date("2026-09-30T23:59:59Z")), "upcoming");
  assert.equal(questPhase(q, new Date("2026-11-30T23:00:00Z")), "live");
  assert.equal(questPhase(q, new Date("2026-12-01T00:00:00Z")), "ended");
  assert.equal(questIdOf(questKey("abc")), "abc");
  assert.equal(questIdOf("BOOKS_READ:1"), null);
});
