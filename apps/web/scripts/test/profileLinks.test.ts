// Profile links (BOO-53): what a reader may put on their profile as a link in bio. They're rendered as
// <a href> on public pages, so only plain web addresses get through.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/profileLinks.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROFILE_LINKS_MAX, normaliseProfileLink, profileLinkLabel, profileLinksProblem } from "@/lib/profile";

test("a typed address becomes a full https link", () => {
  assert.equal(normaliseProfileLink("tiktok.com/@mei"), "https://tiktok.com/@mei");
  assert.equal(normaliseProfileLink("  https://mei.blog/  "), "https://mei.blog/");
  assert.equal(normaliseProfileLink("http://old.example.org"), "http://old.example.org/");
});

test("anything that isn't a plain web address is refused", () => {
  for (const bad of ["", "   ", "javascript:alert(1)", "data:text/html,hi", "mailto:a@b.co", "ftp://x.com", "https://user:pw@x.com", "localhost", "https://intranet", "x".repeat(201) + ".com"]) {
    assert.equal(normaliseProfileLink(bad), null, JSON.stringify(bad));
  }
});

test("a list is checked as a whole", () => {
  assert.equal(profileLinksProblem([]), null);
  assert.equal(profileLinksProblem(["tiktok.com/@mei", "mei.substack.com"]), null);
  assert.ok(profileLinksProblem(Array(PROFILE_LINKS_MAX + 1).fill("a.com")));
  assert.ok(profileLinksProblem(["a.com", "javascript:alert(1)"]));
  assert.ok(profileLinksProblem("a.com"));
  assert.ok(profileLinksProblem([{ $ne: null }]));
});

test("a link's chip says where it goes", () => {
  assert.equal(profileLinkLabel("https://www.tiktok.com/@mei"), "TikTok");
  assert.equal(profileLinkLabel("https://instagram.com/mei"), "Instagram");
  assert.equal(profileLinkLabel("https://mei.substack.com/"), "Newsletter");
  assert.equal(profileLinkLabel("https://www.mei.blog/about"), "mei.blog");
});
