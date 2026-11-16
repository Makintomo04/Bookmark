// Wrap cards (BOO-50): the cover grid's layout at every size and book count, the card copy, the mood
// mix and the option parsing. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/wrapCards.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_DESIGNS,
  CARD_SIZES,
  cardFileName,
  cardMonths,
  cardPath,
  cardProfilePath,
  cardShortPath,
  cardPeriodKey,
  cardPeriodKeys,
  cardToday,
  cardYears,
  cardStats,
  cardTitle,
  gridLayout,
  moodMix,
  parseCardDesign,
  parseCardKind,
  parseCardSize,
  type GridBox,
} from "@bookmark/shared/wrapCards";
import { signupSourceFrom } from "@bookmark/shared/signupSource";
import { finishDay } from "@bookmark/shared/timeZone";
import { parseDate } from "@/lib/import/formats";
import { FREE } from "@bookmark/shared/plusFeatures";
import { entitlementsOf } from "@bookmark/shared/entitlements";

// Roughly the grid areas wrapCardImage.tsx works out for each size.
const BOXES: Record<keyof typeof CARD_SIZES, GridBox> = {
  story: { width: 904, height: 1180, gap: 20, minCover: 84, maxCover: 542, labelHeight: 40, labelMinCover: 150 },
  portrait: { width: 936, height: 760, gap: 16, minCover: 84, maxCover: 562, labelHeight: 40, labelMinCover: 150 },
  square: { width: 952, height: 560, gap: 14, minCover: 84, maxCover: 571, labelHeight: 40, labelMinCover: 150 },
};

const fits = (n: number, box: GridBox) => {
  const l = gridLayout(n, box);
  const cells = l.shown + (l.more ? 1 : 0);
  const rows = Math.ceil(cells / l.columns);
  const width = l.columns * l.coverWidth + (l.columns - 1) * box.gap;
  const height = rows * (l.coverHeight + (l.labels ? box.labelHeight : 0)) + (rows - 1) * box.gap;
  return { l, cells, width, height };
};

for (const [size, box] of Object.entries(BOXES)) {
  test(`${size}: 1, 4, 12, 30 and 120 books all fit the box`, () => {
    for (const n of [1, 4, 12, 30, 45, 120]) {
      const { l, cells, width, height } = fits(n, box);
      assert.ok(width <= box.width, `${n} books: ${width} wide in ${box.width}`);
      assert.ok(height <= box.height, `${n} books: ${height} tall in ${box.height}`);
      assert.ok(l.coverWidth >= box.minCover, `${n} books: covers ${l.coverWidth} wide`);
      assert.ok(l.coverWidth <= box.maxCover);
      assert.equal(l.shown + l.more, n, `${n} books: every book drawn or counted`);
      assert.ok(cells <= l.columns * l.rows);
      assert.equal(l.coverHeight, Math.floor(l.coverWidth * 1.5));
    }
  });
}

test("one book is one big cover with its stars under it", () => {
  const l = gridLayout(1, BOXES.story);
  assert.deepEqual([l.columns, l.shown, l.more, l.labels], [1, 1, 0, true]);
  assert.equal(l.coverWidth, BOXES.story.maxCover);
});

test("30 books on a story are all shown", () => {
  const l = gridLayout(30, BOXES.story);
  assert.equal(l.shown, 30);
  assert.equal(l.more, 0);
});

test("too many for a square: the last cell says how many more", () => {
  const l = gridLayout(120, BOXES.square);
  assert.ok(l.more > 1);
  assert.equal(l.shown + l.more, 120);
  assert.equal(l.coverWidth >= 84, true);
});

test("small covers carry their rating on the cover instead of under it", () => {
  const l = gridLayout(30, BOXES.square);
  assert.equal(l.labels, false);
  assert.ok(l.coverWidth < 150);
});

test("no rated books leaves no room for stars", () => {
  const box = { ...BOXES.story, labelHeight: 0 };
  assert.ok(gridLayout(4, box).coverWidth >= gridLayout(4, BOXES.story).coverWidth);
});

test("titles and kickers", () => {
  assert.equal(cardTitle(2026, 9, true), "My October in books");
  assert.equal(cardTitle(2026, 9, false), "My October in books");
  assert.equal(cardTitle(2026, null, true), "My 2026 so far");
  assert.equal(cardTitle(2025, null, false), "My 2025 in books");
});

test("hours listened are their own figure, and singular reads as singular", () => {
  assert.deepEqual(cardStats({ books: 12, pages: 3480, minutes: 845 }), [
    { value: "12", label: "books" },
    { value: "3,480", label: "pages" },
    { value: "14", label: "hours listened" },
  ]);
  assert.deepEqual(cardStats({ books: 1, pages: 0, minutes: 45 }), [
    { value: "1", label: "book" },
    { value: "45", label: "minutes listened" },
  ]);
  assert.deepEqual(cardStats({ books: 2, pages: 600, minutes: 0 }).map((s) => s.label), ["books", "pages"]);
  // A re-read in the period: 11 covers, 12 reads, as /stats counts them.
  assert.deepEqual(cardStats({ books: 11, reads: 12, pages: 0, minutes: 0 }), [{ value: "11", label: "books · 12 reads" }]);
  assert.deepEqual(cardStats({ books: 11, reads: 11, pages: 0, minutes: 0 }), [{ value: "11", label: "books" }]);
});

test("the mood mix is the top three, in whole percentages, without the noise", () => {
  assert.deepEqual(moodMix({ EMOTIONAL: 4, DARK: 3, HOPEFUL: 2, FUNNY: 1 }), [
    { mood: "EMOTIONAL", label: "emotional", percent: 40 },
    { mood: "DARK", label: "dark", percent: 30 },
    { mood: "HOPEFUL", label: "hopeful", percent: 20 },
  ]);
  assert.deepEqual(moodMix({}), []);
  assert.deepEqual(moodMix({ TENSE: 40, FUNNY: 1 }).map((m) => m.mood), ["TENSE"]);
});

test("options parse to safe defaults", () => {
  assert.equal(parseCardKind("stats"), "stats");
  assert.equal(parseCardKind("<script>"), "grid");
  assert.equal(parseCardSize("square"), "square");
  assert.equal(parseCardSize(null), "story");
  assert.equal(parseCardDesign("paper"), "paper");
  assert.equal(parseCardDesign("toString"), "midnight");
});

test("paths and file names", () => {
  assert.equal(cardPath({ kind: "grid", size: "story", design: "midnight", year: 2026, month: 10 }), "/api/wrap/card?kind=grid&size=story&design=midnight&year=2026&month=10");
  assert.equal(cardPath({ kind: "stats", size: "square", design: "paper", year: 2025, month: null, hideRatings: true }), "/api/wrap/card?kind=stats&size=square&design=paper&year=2025&ratings=hide");
  assert.equal(cardFileName({ kind: "grid", size: "portrait", year: 2026, month: 3 }), "bookmark-grid-2026-03-portrait");
  assert.equal(cardFileName({ kind: "stats", size: "story", year: 2026, month: null }), "bookmark-stats-2026-story");
});

test("one design is free, the rest are Plus, and the free column doesn't overclaim", () => {
  assert.deepEqual(Object.entries(CARD_DESIGNS).filter(([, d]) => !d.plus).map(([k]) => k), ["midnight"]);
  assert.equal(entitlementsOf({}).customWrapDesigns, false);
  assert.ok(FREE.some((line) => /cover grid/i.test(line)));
});

// Tracked by address, not cookie: the mark has to survive every way sign-up carries the page along.
test("a card's links are marked, and the mark survives sign-up's callbacks", () => {
  assert.equal(cardProfilePath("bigshelf"), "/u/bigshelf?from=card");
  assert.equal(cardShortPath("bigshelf"), "/w/bigshelf");
  assert.equal(signupSourceFrom(cardProfilePath("bigshelf")), "card");
  // Google and Apple: home, with the page as its callback, as /new-user receives it.
  assert.equal(signupSourceFrom(`/?callbackUrl=${encodeURIComponent(cardProfilePath("bigshelf"))}`), "card");
  assert.equal(signupSourceFrom(`/u/bigshelf?from=card#shelf`), "card");
  for (const path of [null, "", "/u/bigshelf", "/u/bigshelf?from=elsewhere", "/?callbackUrl=%2Fu%2Fbigshelf", "not a path %"]) {
    assert.equal(signupSourceFrom(path), null, String(path));
  }
});

test("the card pickers count months in the profile's zone, back to the reader's first year", () => {
  // 23:30 on 31 October in London is already 1 November in Auckland, and still October in New York.
  const now = new Date("2026-10-31T23:30:00Z");
  assert.deepEqual(cardToday("Europe/London", now), { year: 2026, month: 10 });
  assert.deepEqual(cardToday("Pacific/Auckland", now), { year: 2026, month: 11 });
  assert.deepEqual(cardToday("Not/AZone", now), { year: 2026, month: 10 });
  // Every year back to the first one with a finish, and always last year; never before 2000.
  assert.deepEqual(cardYears({ year: 2026 }, [2019, 2026]), [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]);
  assert.deepEqual(cardYears({ year: 2026 }, []), [2026, 2025]);
  assert.equal(cardYears({ year: 2026 }, [1980]).at(-1), 2000);
  // Only months that have started: all of a past year, this year up to this month, none of a future one.
  assert.deepEqual(cardMonths(2026, { year: 2026, month: 3 }), [3, 2, 1]);
  assert.equal(cardMonths(2025, { year: 2026, month: 3 }).length, 12);
  assert.deepEqual(cardMonths(2027, { year: 2026, month: 3 }), []);
});

test("the picker knows which years and months have books to draw", () => {
  const keys = cardPeriodKeys([{ year: 2026, month: 10 }, { year: 2026, month: 10 }, { year: 2024, month: 3 }]);
  assert.deepEqual(keys.sort(), ["2024", "2024-03", "2026", "2026-10"]);
  assert.ok(keys.includes(cardPeriodKey(2026, 10)));
  assert.ok(!keys.includes(cardPeriodKey(2026, 9)));
  assert.ok(!keys.includes(cardPeriodKey(2025, null)));
});

test("a picked day counts on that day at UTC+13 and UTC+14, and a timed finish in the reader's zone", () => {
  // Stored at noon UTC (lib/readHistory.ts dayInputSchema): 31 October stays October in Auckland and Kiritimati.
  const picked = new Date("2026-10-31T12:00:00.000Z");
  assert.equal(finishDay(picked, "Pacific/Auckland"), "2026-10-31");
  assert.equal(finishDay(picked, "Pacific/Kiritimati"), "2026-10-31");
  assert.equal(finishDay(new Date("2026-12-31T12:00:00.000Z"), "Pacific/Auckland"), "2026-12-31");
  // A finish logged at a real moment is placed where the reader is.
  assert.equal(finishDay(new Date("2026-10-31T12:00:01.000Z"), "Pacific/Auckland"), "2026-11-01");
  assert.equal(finishDay(new Date("2026-10-31T23:30:00.000Z"), "America/New_York"), "2026-10-31");
});

test("an imported day at UTC midnight counts on that day west and east of UTC, 1 January included", () => {
  // lib/import/formats.ts parseDate stores "2023/01/01", "2023/01" and "2023" all at 2023-01-01T00:00Z.
  const newYear = new Date(parseDate("2023/01/01")!);
  for (const zone of ["America/New_York", "America/Los_Angeles", "Pacific/Honolulu", "Europe/London", "Asia/Tokyo", "Pacific/Kiritimati"]) {
    assert.equal(finishDay(newYear, zone), "2023-01-01", zone);
    assert.equal(finishDay(new Date(parseDate("2023")!), zone), "2023-01-01", zone);
    assert.equal(finishDay(new Date(parseDate("2023/11")!), zone), "2023-11-01", zone);
  }
  // A real moment a second after midnight UTC is still the evening before in New York.
  assert.equal(finishDay(new Date("2023-01-01T00:00:01.000Z"), "America/New_York"), "2022-12-31");
});
