// Share images (BOO-50): the one list of hosts they fetch covers and avatars from, and what it lets through.
// No network.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/shareImages.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHARE_IMAGE_HOSTS, shareImageUrl } from "@/lib/shareImages";
import nextConfig from "../../next.config.mjs";

test("share images fetch from exactly the hosts book pages load images from", () => {
  // A host on one list and not the other is how Hardcover covers fell back to title tiles (round 10, bug 11).
  const pageHosts = (nextConfig.images?.remotePatterns ?? []).map((p) => ("hostname" in p ? p.hostname : ""));
  assert.deepEqual([...SHARE_IMAGE_HOSTS].sort(), [...pageHosts].sort());
});

test("only https from those hosts, or this site's own paths", () => {
  assert.equal(shareImageUrl("https://assets.hardcover.app/edition/1/cover.jpg")?.hostname, "assets.hardcover.app");
  assert.equal(shareImageUrl("http://covers.openlibrary.org/b/id/1-L.jpg"), null);
  assert.equal(shareImageUrl("https://169.254.169.254/latest/meta-data"), null);
  assert.equal(shareImageUrl("//evil.example/x.png"), null);
  assert.ok(shareImageUrl("/avatars/fox.png"));
  assert.equal(shareImageUrl(null), null);
});
