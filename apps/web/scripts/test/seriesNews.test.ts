// New books in a series (lib/seriesNews.ts): who's told, how often, and in what words. No database or
// network.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/seriesNews.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { announceFrom, highestPosition, seriesNewsNotifications, type SeriesShelfRow } from "@/lib/seriesNews";
import { seriesNewsText } from "@/lib/series";
import { pushContentFor, pushGroupOf, pushedToSelf } from "@bookmark/shared/push";

const shelf = (userId: string, workId: string, status: string, timesRead = 0): SeriesShelfRow => ({ userId, workId, status, timesRead });
const BOOK_4 = { id: "w4", position: 4 };
const BOOK_5 = { id: "w5", position: 5 };

test("followers and readers who've started the series are told; Want to read and DNF alone aren't", () => {
  const rows = seriesNewsNotifications({
    followers: ["follower"],
    shelf: [
      shelf("reading", "w1", "STARTED"),
      shelf("finished", "w1", "COMPLETED"),
      shelf("paused", "w2", "PAUSED"),
      shelf("reread", "w1", "NOT_STARTED", 1),
      shelf("wants", "w1", "NOT_STARTED"),
      shelf("gaveUp", "w1", "DNF"),
    ],
    newWorks: [BOOK_4],
  });
  assert.deepEqual(rows.map((r) => r.userId).sort(), ["finished", "follower", "paused", "reading", "reread"]);
  for (const r of rows) {
    assert.equal(r.type, "NEW_IN_SERIES");
    assert.equal(r.actorId, r.userId);
    assert.equal(r.workId, "w4");
    assert.equal(r.count, 1);
  }
});

test("a DNF reader who follows the series is still told", () => {
  const rows = seriesNewsNotifications({ followers: ["gaveUp"], shelf: [shelf("gaveUp", "w1", "DNF")], newWorks: [BOOK_4] });
  assert.deepEqual(rows.map((r) => r.userId), ["gaveUp"]);
});

test("a new book already on the reader's shelf isn't news to them", () => {
  const rows = seriesNewsNotifications({
    followers: [],
    shelf: [shelf("ana", "w1", "COMPLETED"), shelf("ana", "w4", "NOT_STARTED"), shelf("ben", "w1", "COMPLETED")],
    newWorks: [BOOK_4],
  });
  assert.deepEqual(rows.map((r) => r.userId), ["ben"]);
});

test("several new books make one notification, counted, naming the first", () => {
  const rows = seriesNewsNotifications({ followers: ["ana"], shelf: [], newWorks: [BOOK_5, BOOK_4] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].workId, "w4");
  assert.equal(rows[0].count, 2);
  // With book 4 shelved, only book 5 is news.
  const later = seriesNewsNotifications({ followers: ["ana"], shelf: [shelf("ana", "w4", "STARTED")], newWorks: [BOOK_4, BOOK_5] });
  assert.equal(later[0].workId, "w5");
  assert.equal(later[0].count, 1);
});

test("a reader already told about a book isn't told again", () => {
  const rows = seriesNewsNotifications({ followers: ["ana", "ben"], shelf: [], newWorks: [BOOK_4], alreadyTold: new Set(["ana|w4"]) });
  assert.deepEqual(rows.map((r) => r.userId), ["ben"]);
  // Told "2 new books, starting with book 4": book 5 was in that notification too.
  const next = seriesNewsNotifications({ followers: ["ana"], shelf: [], newWorks: [BOOK_4, BOOK_5], alreadyTold: new Set(["ana|w4"]) });
  assert.deepEqual(next, []);
});

test("the furthest book counts whole-numbered places only", () => {
  assert.equal(highestPosition([1, 2, 2.5, 3, null, undefined]), 3);
  assert.equal(highestPosition([0.5, null]), null);
  assert.equal(highestPosition([]), null);
});

test("readers are told about books past what Hardcover showed before, and never on a first sighting", () => {
  const known = { hardcoverSeriesId: 7, highestPosition: 3, announceAfter: null };
  assert.equal(announceFrom(known, 4), 3);
  assert.equal(announceFrom(known, 3), null);
  assert.equal(announceFrom(known, null), null);
  // First sighting, or only the catalogue's books before: what Hardcover has may be years old.
  assert.equal(announceFrom(null, 4), null);
  assert.equal(announceFrom({ ...known, hardcoverSeriesId: null }, 4), null);
  // A lookup with announcing off.
  assert.equal(announceFrom(known, 4, false), null);
});

test("an announcement under way is kept until its readers are told", () => {
  const telling = { hardcoverSeriesId: 7, highestPosition: 4, announceAfter: 3 };
  assert.equal(announceFrom(telling, 4), 3);
  assert.equal(announceFrom(telling, 5), 3);
  assert.equal(announceFrom(telling, 5, false), 3);
});

test("the words name the book, its place and its series", () => {
  assert.equal(seriesNewsText({ title: "The Alloy of Law", seriesName: "Mistborn", position: 4, count: 1 }), "The Alloy of Law is out: Book 4 of Mistborn");
  assert.equal(seriesNewsText({ title: "The Alloy of Law", seriesName: "Mistborn", position: null, count: null }), "The Alloy of Law is out in Mistborn");
  assert.equal(seriesNewsText({ title: "The Alloy of Law", seriesName: "Mistborn", position: 4, count: 3 }), "3 new books in Mistborn, starting with The Alloy of Law");
});

test("the push can be switched off as its own group, and reaches the reader though they're the actor", () => {
  assert.equal(pushGroupOf("NEW_IN_SERIES"), "series");
  assert.ok(pushedToSelf("NEW_IN_SERIES"));
  assert.ok(!pushedToSelf("NEW_FOLLOWER"));
  const push = pushContentFor({ type: "NEW_IN_SERIES", actorUsername: "ana", bookTitle: "The Alloy of Law", buddyReadId: null, count: 1, seriesName: "Mistborn", seriesPosition: 4 })!;
  assert.equal(push.body, "The Alloy of Law is out: Book 4 of Mistborn.");
  assert.equal(push.path, "/notifications");
  // Nobody did it, so nobody is named.
  assert.ok(!push.body.includes("ana"));
});
