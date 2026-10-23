// Removing a deleted account's images (lib/uploadedImages.ts): only UploadThing files are touched, and a
// file something else still shows is kept. The database and UploadThing are fakes.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/uploadedImages.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteUnusedUploads, isOpenLibraryCopyName, isShareableCover, uploadThingKey } from "@/lib/uploadedImages";

const READER = "6560f1c2a1b2c3d4e5f60001";
const OTHER = "6560f1c2a1b2c3d4e5f60002";
const UPLOAD = "https://utfs.io/a/app1/reader-photo.jpg";
const uploaders = new Map([["reader-photo.jpg", READER]]);

test("our copies of Open Library covers are told apart from uploads by their stored name", () => {
  assert.ok(isOpenLibraryCopyName("b-id-11481354-L.jpg"));
  assert.ok(isOpenLibraryCopyName("b-isbn-9780316556347-M.jpg"));
  assert.ok(isOpenLibraryCopyName("b-olid-OL7353617M-L.jpg"));
  assert.ok(!isOpenLibraryCopyName("photo.jpg"));
  assert.ok(!isOpenLibraryCopyName("IMG_2041.HEIC"));
  assert.ok(!isOpenLibraryCopyName("b-id-123.jpg"));
  assert.ok(!isOpenLibraryCopyName(null));
});

test("an upload stays on its uploader's own copy and nowhere shared", () => {
  // Their own shelf: fine. Someone else's copy, or anywhere shared: not.
  assert.equal(isShareableCover(UPLOAD, uploaders, READER), true);
  assert.equal(isShareableCover(UPLOAD, uploaders, OTHER), false);
  assert.equal(isShareableCover(UPLOAD, uploaders, null), false);
  // Under its other URL form too.
  assert.equal(isShareableCover("https://app1.ufs.sh/f/reader-photo.jpg", uploaders, null), false);
});

test("Open Library covers and our stored copies of them go anywhere", () => {
  for (const url of ["https://covers.openlibrary.org/b/id/1-L.jpg", "https://utfs.io/a/app1/b-id-1-L.jpg-key"]) {
    assert.equal(isShareableCover(url, uploaders, null), true);
    assert.equal(isShareableCover(url, uploaders, OTHER), true);
  }
  assert.equal(isShareableCover(null, uploaders, null), false);
  assert.equal(isShareableCover("", uploaders, READER), false);
});

test("only UploadThing file URLs have a key", () => {
  assert.equal(uploadThingKey("https://utfs.io/f/abc123_cover.jpg"), "abc123_cover.jpg");
  assert.equal(uploadThingKey("https://x7y2.ufs.sh/f/abc123_cover.jpg"), "abc123_cover.jpg");
  // The form uploadFiles returns: the app id, then the key.
  assert.equal(uploadThingKey("https://utfs.io/a/eepqfzt9a5/febf277a-1a2f_photo.jpg"), "febf277a-1a2f_photo.jpg");
  assert.equal(uploadThingKey("https://utfs.io/a/eepqfzt9a5"), null);
  assert.equal(uploadThingKey("https://covers.openlibrary.org/b/id/123-L.jpg"), null);
  assert.equal(uploadThingKey("https://lh3.googleusercontent.com/a/photo"), null);
  assert.equal(uploadThingKey("http://utfs.io/f/abc"), null);
  assert.equal(uploadThingKey("https://utfs.io/somewhere/else"), null);
  assert.equal(uploadThingKey("https://evil.example/f/abc"), null);
  assert.equal(uploadThingKey("not a url"), null);
  assert.equal(uploadThingKey(null), null);
});

function fakes(used: string[] = []) {
  const deleted: string[][] = [];
  const asked: string[][] = [];
  return {
    deleted,
    asked,
    deps: {
      stillUsed: async (urls: string[]) => { asked.push(urls); return new Set(urls.filter((u) => used.includes(u))); },
      deleteFiles: async (keys: string[]) => { deleted.push(keys); },
    },
  };
}

test("the account's own uploads are deleted, once each", async () => {
  const f = fakes();
  const result = await deleteUnusedUploads(
    ["https://utfs.io/f/avatar.png", "https://utfs.io/f/banner.png", "https://utfs.io/f/cover.jpg", "https://utfs.io/f/cover.jpg"],
    f.deps,
  );
  assert.deepEqual(f.deleted, [["avatar.png", "banner.png", "cover.jpg"]]);
  assert.deepEqual(result, { deleted: ["avatar.png", "banner.png", "cover.jpg"], kept: [] });
});

test("files something else still shows are kept: a circle snapshot, a copied list, the catalogue", async () => {
  const f = fakes(["https://utfs.io/f/shared-cover.jpg"]);
  const result = await deleteUnusedUploads(["https://utfs.io/f/avatar.png", "https://utfs.io/f/shared-cover.jpg"], f.deps);
  assert.deepEqual(f.deleted, [["avatar.png"]]);
  assert.deepEqual(result.kept, ["shared-cover.jpg"]);
});

test("a file named by two URLs is kept when either is still used", async () => {
  const f = fakes(["https://app1.ufs.sh/f/same.jpg"]);
  await deleteUnusedUploads(["https://utfs.io/a/app1/same.jpg", "https://app1.ufs.sh/f/same.jpg"], f.deps);
  assert.deepEqual(f.deleted, []);
});

test("images hosted elsewhere are never sent to UploadThing, and nothing is asked when there's nothing to do", async () => {
  const f = fakes();
  const result = await deleteUnusedUploads(["https://covers.openlibrary.org/b/id/1-L.jpg", "https://lh3.googleusercontent.com/a/x", null, undefined], f.deps);
  assert.deepEqual(f.asked, []);
  assert.deepEqual(f.deleted, []);
  assert.deepEqual(result, { deleted: [], kept: [] });
});
