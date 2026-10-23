// The clean-up behind private uploads (lib/coverCleanup.ts, run by scripts/private-covers.ts): which files
// count as uploads, who they're recorded against, and how each shared place gives them up.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/coverCleanup.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { planCoverCleanup, type CleanupSnapshot } from "@/lib/coverCleanup";

const UPLOADER = "6560f1c2a1b2c3d4e5f60001";
const FRIEND = "6560f1c2a1b2c3d4e5f60002";
const HOST = "6560f1c2a1b2c3d4e5f60003";

// A reader's uploaded Dune cover, and our stored copy of Open Library's Circe cover.
const UPLOAD = "https://utfs.io/a/app1/upload-key.jpg";
const COPY = "https://utfs.io/a/app1/copy-key.jpg";
const OL_DUNE = "https://covers.openlibrary.org/b/id/42-L.jpg";
const day = (n: number) => new Date(Date.UTC(2026, 9, n));

// The upload spread the way it could before: search took it to the friend's copy, the catalogue filled
// in with it, the friend's circle snapshot and a list carry it.
function spread(over: Partial<CleanupSnapshot> = {}): CleanupSnapshot {
  return {
    fileNames: new Map([["upload-key.jpg", "IMG_2041.jpg"], ["copy-key.jpg", "b-id-7-L.jpg"]]),
    uploads: new Map(),
    users: [],
    books: [
      { id: "b-uploader", userId: UPLOADER, coverImage: UPLOAD, editionId: "e-dune", workId: "w-dune", workKey: "OL1W", createdAt: day(1) },
      { id: "b-friend", userId: FRIEND, coverImage: UPLOAD, editionId: "e-dune", workId: "w-dune", workKey: "OL1W", createdAt: day(5) },
      { id: "b-circe", userId: FRIEND, coverImage: COPY, editionId: "e-circe", workId: "w-circe", workKey: "OL2W", createdAt: day(2) },
    ],
    editions: [
      { id: "e-dune", workId: "w-dune", coverUrl: UPLOAD },
      { id: "e-circe", workId: "w-circe", coverUrl: COPY },
    ],
    works: [
      { id: "w-dune", openLibraryKey: "OL1W", coverUrl: OL_DUNE },
      { id: "w-circe", openLibraryKey: "OL2W", coverUrl: COPY },
    ],
    listItems: [
      { id: "li-dune", ownerId: FRIEND, workKey: "OL1W", coverUrl: UPLOAD },
      { id: "li-circe", ownerId: FRIEND, workKey: "OL2W", coverUrl: COPY },
    ],
    circles: [{ id: "c-dune", hostId: HOST, workKey: "OL1W", coverImage: UPLOAD }],
    ...over,
  };
}

test("an older upload is recorded against the earliest copy's reader", () => {
  const plan = planCoverCleanup(spread());
  assert.deepEqual(plan.record, [{ key: "upload-key.jpg", url: UPLOAD, userId: UPLOADER, kind: "cover" }]);
  assert.deepEqual(plan.ownerUnknown, []);
});

test("every shared place gives the upload up, and our Open Library copies stay where they are", () => {
  const plan = planCoverCleanup(spread());
  assert.deepEqual(plan.editions, [{ id: "e-dune", coverUrl: null }]);
  assert.deepEqual(plan.works, []);
  // The circle and the list item take the work's Open Library cover.
  assert.deepEqual(plan.circles, [{ id: "c-dune", coverImage: OL_DUNE }]);
  assert.deepEqual(plan.listItems, [{ id: "li-dune", coverUrl: OL_DUNE }]);
  // The friend's copy does too; the uploader's own copy keeps the upload; Circe is untouched.
  assert.deepEqual(plan.books, [{ id: "b-friend", coverImage: OL_DUNE }]);
});

test("with no catalogue cover to fall back on, a copy shows its title card and a list item none", () => {
  const plan = planCoverCleanup(spread({ works: [{ id: "w-dune", openLibraryKey: "OL1W", coverUrl: null }, { id: "w-circe", openLibraryKey: "OL2W", coverUrl: COPY }] }));
  assert.deepEqual(plan.books, [{ id: "b-friend", coverImage: "" }]);
  assert.deepEqual(plan.listItems, [{ id: "li-dune", coverUrl: null }]);
  assert.deepEqual(plan.circles, [{ id: "c-dune", coverImage: null }]);
});

test("an upload already recorded keeps its uploader, and still leaves the shared places", () => {
  const plan = planCoverCleanup(spread({ uploads: new Map([["upload-key.jpg", FRIEND]]), fileNames: new Map([["copy-key.jpg", "b-id-7-L.jpg"]]) }));
  assert.deepEqual(plan.record, []);
  // Recorded as the friend's, so the friend's copy keeps it and the first reader's copy gives it up.
  assert.deepEqual(plan.books, [{ id: "b-uploader", coverImage: OL_DUNE }]);
  assert.equal(plan.circles.length, 1);
});

test("profile pictures are recorded as the profile's own", () => {
  const avatar = "https://utfs.io/a/app1/avatar-key.png";
  const plan = planCoverCleanup(spread({
    fileNames: new Map([["avatar-key.png", "me.png"]]),
    users: [{ id: FRIEND, image: avatar, banner: null }],
    books: [], editions: [], works: [], listItems: [], circles: [],
  }));
  assert.deepEqual(plan.record, [{ key: "avatar-key.png", url: avatar, userId: FRIEND, kind: "avatar" }]);
});

test("an upload seen only in the catalogue is taken out with no owner to record", () => {
  const plan = planCoverCleanup(spread({ books: [], listItems: [], circles: [] }));
  assert.deepEqual(plan.record, []);
  assert.deepEqual(plan.ownerUnknown, ["upload-key.jpg"]);
  assert.deepEqual(plan.editions, [{ id: "e-dune", coverUrl: null }]);
});

test("a file whose name can't be read is reported and left alone", () => {
  const plan = planCoverCleanup(spread({ fileNames: new Map([["upload-key.jpg", null], ["copy-key.jpg", "b-id-7-L.jpg"]]) }));
  assert.deepEqual(plan.unreadable, ["upload-key.jpg"]);
  assert.deepEqual([plan.record, plan.editions, plan.circles, plan.listItems, plan.books], [[], [], [], [], []]);
});
