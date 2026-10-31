// Release dates (BOO-7) and new-book and publication-day alerts (BOO-8): reading dates, en-GB wording,
// who's told about a new book or a publication day and how often, Upcoming's order, the weekly email's
// sections, and the catalogue keeping a reprint's date off the work. No database or network.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/releases.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstReleaseDate, formatReleaseDate, isUpcoming, newBookText, publicationDayText, publishedFact, releaseDateFrom,
} from "@bookmark/shared/releases";
import { pushContentFor, pushGroupOf, pushGroupsFor, pushedToSelf } from "@bookmark/shared/push";
import { buildWeeklyDigest, type DigestData } from "@bookmark/shared/digest";
import { authorNewsNotifications, freshReleases, isAnnounced, seenIdsOf } from "@/lib/authorNews";
import { isFirstRelease, publicationDayReaders } from "@/lib/releaseRules";
import { rankUpcoming, type UpcomingWork } from "@/lib/upcoming";
import { resolveOne } from "../../lib/catalog/resolve.ts";
import { MemoryCatalogStore } from "../../lib/catalog/memoryStore.ts";

const TODAY = "2026-10-31";

test("full dates are read from the ways Open Library and Hardcover write them", () => {
  assert.equal(releaseDateFrom("2027-04-09"), "2027-04-09");
  assert.equal(releaseDateFrom("2027-04-09T00:00:00Z"), "2027-04-09");
  assert.equal(releaseDateFrom("March 4, 2014"), "2014-03-04");
  assert.equal(releaseDateFrom("Mar. 4 2014"), "2014-03-04");
  assert.equal(releaseDateFrom("4 March 2014"), "2014-03-04");
  assert.equal(releaseDateFrom("4th Sept 2014"), "2014-09-04");
  // A year or a month alone isn't a day, and day-or-month-first can't be told apart.
  for (const raw of ["2014", "March 2014", "03/04/2014", "", null, "31 April 2014", "Ma 4 2014"]) assert.equal(releaseDateFrom(raw), null, String(raw));
});

test("a work's first release is the earliest full date in its first year", () => {
  assert.equal(firstReleaseDate(["1965", "August 1, 1965", "June 1966", "1 June 1965"], 1965), "1965-06-01");
  // Only reprints have full dates: no date rather than the wrong one.
  assert.equal(firstReleaseDate(["1965", "2019-10-01"], 1965), null);
  assert.equal(firstReleaseDate(["2019-10-01"], null), null);
});

test("dates are written en-GB, and a book page says whether it's out", () => {
  assert.equal(formatReleaseDate("2027-04-09"), "9 April 2027");
  assert.equal(formatReleaseDate("2026-12-01"), "1 December 2026");
  assert.equal(isUpcoming("2026-11-01", TODAY), true);
  assert.equal(isUpcoming(TODAY, TODAY), false);
  assert.deepEqual(publishedFact({ releaseDate: "2027-04-09", year: 2027 }, TODAY), { label: "Coming out", value: "9 April 2027" });
  assert.deepEqual(publishedFact({ releaseDate: "2014-03-04", year: 2014 }, TODAY), { label: "First published", value: "4 March 2014" });
  // An edition with only a year still shows it.
  assert.deepEqual(publishedFact({ year: 1965 }, TODAY), { label: "First published", value: "1965" });
  assert.equal(publishedFact({}, TODAY), null);
});

test("alerts say the title, author and date, nothing more", () => {
  assert.equal(newBookText({ title: "The Familiar", author: "Leigh Bardugo", releaseDate: "2027-04-09", count: 1 }, TODAY), "The Familiar by Leigh Bardugo comes out on 9 April 2027");
  assert.equal(newBookText({ title: "The Familiar", author: "Leigh Bardugo", releaseDate: "2026-10-20", count: 1 }, TODAY), "The Familiar by Leigh Bardugo is out now");
  assert.equal(newBookText({ title: "Blightfall", author: "Brandon Sanderson", releaseDate: "2027-01-01", count: 3 }, TODAY), "3 new books from Brandon Sanderson, starting with Blightfall");
  assert.equal(publicationDayText({ title: "The Familiar", author: "Leigh Bardugo" }), "The Familiar by Leigh Bardugo is out today");
  assert.equal(publicationDayText({ title: null, author: null }), "A new book is out today");
});

test("both alerts are pushed to the reader, each with its own switch", () => {
  assert.equal(pushGroupOf("NEW_BOOK"), "newBooks");
  assert.equal(pushGroupOf("PUBLICATION_DAY"), "publicationDay");
  assert.ok(pushedToSelf("NEW_BOOK") && pushedToSelf("PUBLICATION_DAY"));
  // On unless switched off, so they're in every reader's settings.
  assert.ok(pushGroupsFor(false).includes("newBooks") && pushGroupsFor(false).includes("publicationDay"));
  const announced = pushContentFor({ type: "NEW_BOOK", actorUsername: "sam", bookTitle: "The Familiar", buddyReadId: null, count: 1, author: "Leigh Bardugo", releaseDate: "2027-04-09", today: TODAY });
  assert.deepEqual(announced, { title: "New from Leigh Bardugo", body: "The Familiar by Leigh Bardugo comes out on 9 April 2027.", path: "/notifications" });
  const out = pushContentFor({ type: "PUBLICATION_DAY", actorUsername: "sam", bookTitle: "The Familiar", buddyReadId: null, count: null, author: "Leigh Bardugo" });
  assert.deepEqual(out, { title: "Out today", body: "The Familiar by Leigh Bardugo is out today.", path: "/notifications" });
});

const release = (id: number, releaseDate: string) => ({ hardcoverId: String(id), releaseDate })

test("a new book is one Hardcover hasn't shown before, coming or just out", () => {
  const releases = [release(1, "2026-09-01"), release(2, "2026-10-25"), release(3, "2027-02-01"), release(4, "2026-12-01")];
  // 1 is too old to be news, 2 and 3 are new, 4 was seen last week.
  assert.deepEqual(freshReleases(releases, [4], TODAY).map((r) => r.hardcoverId), ["2", "3"]);
  assert.deepEqual(seenIdsOf(releases), [1, 2, 3, 4]);
  // Asked again with nothing changed, nothing is new.
  assert.deepEqual(freshReleases(releases, seenIdsOf(releases), TODAY), []);

  // Placeholders wait until they have a title and a date within two years.
  assert.equal(isAnnounced({ title: "Untitled Stormlight Archive #6", releaseDate: "2027-12-01" }, TODAY), false);
  assert.equal(isAnnounced({ title: "Ghostbloods 3", releaseDate: "2030-12-01" }, TODAY), false);
  assert.equal(isAnnounced({ title: "Horneater", releaseDate: "2027-12-01" }, TODAY), true);
});

test("an author's followers hear of every new book, a series' followers of its own, once each", () => {
  const books = [
    { workId: "w-later", seriesKey: "riftwake|brandon-sanderson", releaseDate: "2027-06-01" },
    { workId: "w-soon", seriesKey: null, releaseDate: "2027-01-10" },
  ];
  const rows = authorNewsNotifications({
    authorFollowers: ["fan", "hasOne", "told"],
    seriesFollowers: new Map([["riftwake|brandon-sanderson", ["seriesFan", "fan"]]]),
    books,
    shelved: new Set(["hasOne|w-soon"]),
    alreadyTold: new Set(["told|w-later"]),
  });
  const byUser = Object.fromEntries(rows.map((r) => [r.userId, r]));
  assert.deepEqual(Object.keys(byUser).sort(), ["fan", "hasOne", "seriesFan"]);
  // Soonest out named first, and counted once for a reader who follows both.
  assert.equal(byUser.fan.workId, "w-soon");
  assert.equal(byUser.fan.count, 2);
  // The series follower hears only of the series book; the reader with an advance copy only of the other.
  assert.deepEqual([byUser.seriesFan.workId, byUser.seriesFan.count], ["w-later", 1]);
  assert.deepEqual([byUser.hasOne.workId, byUser.hasOne.count], ["w-later", 1]);
  for (const r of rows) {
    assert.equal(r.type, "NEW_BOOK");
    assert.equal(r.actorId, r.userId);
  }
});

test("publication day: Want to read and followers, not those who already have it or just heard", () => {
  const readers = publicationDayReaders({
    shelf: [
      { userId: "wants", status: "NOT_STARTED" },
      { userId: "arc", status: "STARTED" },
      { userId: "fanWithArc", status: "COMPLETED" },
      { userId: "nope", status: "NOT_INTERESTED" },
    ],
    followers: ["fan", "fanWithArc", "nope", "justTold"],
    recentlyTold: new Set(["justTold"]),
  });
  assert.deepEqual(readers.sort(), ["fan", "wants"]);
  // A reprint's date isn't publication day.
  assert.equal(isFirstRelease({ releaseDate: "2026-10-31", firstPublishYear: 1965 }), false);
  assert.equal(isFirstRelease({ releaseDate: "2026-10-31", firstPublishYear: 2026 }), true);
  assert.equal(isFirstRelease({ releaseDate: "2026-10-31", firstPublishYear: null }), true);
});

const work = (id: string, releaseDate: string | null, extra: Partial<UpcomingWork> = {}): UpcomingWork => ({
  id, openLibraryKey: null, hardcoverId: id, pageApprovedAt: null, title: id, authors: ["Someone Else"], authorKeys: [], seriesName: null,
  coverUrl: null, firstPublishYear: null, releaseDate, ...extra,
});

test("Upcoming shows only books still to come, followed ones first, soonest first", () => {
  const works = [
    work("out-today", TODAY),
    work("past", "2026-01-01"),
    work("undated", null),
    work("soon", "2026-11-05"),
    work("later-followed", "2027-03-01", { authors: ["Leigh Bardugo"] }),
    work("series-followed", "2027-01-01", { authors: ["Brandon Sanderson"], seriesName: "Riftwake" }),
  ];
  const follows = { authorKeys: new Set<string>(), authorSlugs: new Set(["leigh-bardugo"]), seriesKeys: new Set(["riftwake|brandon-sanderson"]) };
  const ranked = rankUpcoming(works, follows, TODAY);
  assert.deepEqual(ranked.map((b) => b.title), ["series-followed", "later-followed", "soon"]);
  assert.deepEqual(ranked.map((b) => b.followed), [true, true, false]);
  // Signed out: the same books, by date.
  assert.deepEqual(rankUpcoming(works, null, TODAY).map((b) => b.title), ["soon", "series-followed", "later-followed"]);
});

const emptyDigest: DigestData = {
  name: "Sam", readingDays: 0, finished: 0, streak: 0, goal: null, checkpoints: [], circles: [], friends: [], series: [],
  logUrl: "https://bookmark.test/", settingsUrl: "https://bookmark.test/settings#notifications", unsubscribeUrl: "https://bookmark.test/email/unsubscribe?t=abc",
  today: TODAY,
};

test("the weekly email says how many came out in a series, and lists books announced and out", () => {
  const email = buildWeeklyDigest({
    ...emptyDigest,
    series: [{ title: "The Alloy of Law", seriesName: "Mistborn", seriesPosition: 4, count: 3 }],
    newBooks: [
      { title: "The Familiar", author: "Leigh Bardugo", releaseDate: "2027-04-09", count: 1 },
      { title: "Blightfall", author: "Brandon Sanderson", releaseDate: "2026-10-20", count: 2 },
    ],
    released: [{ title: "Wandersail", author: "Brandon Sanderson" }],
  })!;
  assert.match(email.text, /3 new books in Mistborn, starting with The Alloy of Law/);
  assert.match(email.text, /New books announced\n- The Familiar by Leigh Bardugo, out 9 April 2027\n- Blightfall by Brandon Sanderson, out now, and 1 more book/);
  assert.match(email.text, /Out this week\n- Wandersail by Brandon Sanderson/);
  // A week with only book news still sends.
  assert.ok(buildWeeklyDigest({ ...emptyDigest, released: [{ title: "Wandersail", author: null }] }));
});

test("a work takes a release date from Hardcover, or an edition from its first year, never a reprint's", async () => {
  const store = new MemoryCatalogStore();
  const announced = await resolveOne({ hardcoverId: "2235778", title: "Blightfall", author: "Brandon Sanderson", releaseDate: "2027-01-10", year: 2027 }, { store });
  assert.equal(announced.work.releaseDate, "2027-01-10");
  assert.equal(announced.edition.releaseDate, "2027-01-10");
  assert.equal(announced.edition.publishedYear, 2027);

  const isbnLookup = (date: string, year: number) => ({
    works: async () => new Map(), work: async () => null, title: async () => null,
    isbn: async () => ({ workKey: `OL${year}W`, editionKey: `OL${year}M`, publishedYear: Number(date.slice(0, 4)), releaseDate: date }),
  });
  const reprint = await resolveOne({ isbn13: "9780441013593", title: "Dune", author: "Frank Herbert", year: 1965 }, { store, lookup: isbnLookup("2019-10-01", 1965) });
  assert.equal(reprint.edition.releaseDate, "2019-10-01");
  assert.equal(reprint.work.releaseDate, null);
  const first = await resolveOne({ isbn13: "9781250178619", title: "Fourth Wing", author: "Rebecca Yarros", year: 2023 }, { store, lookup: isbnLookup("2023-05-02", 2023) });
  assert.equal(first.work.releaseDate, "2023-05-02");
});
