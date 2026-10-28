// Author social links: Wikidata handles and Open Library's volunteer links into one tidy row. No database or network.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/authorLinks.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { linksFromOpenLibrary, linksFromWikidata, mergeAuthorLinks, type AuthorLink } from "@/lib/authorLinks";

const entity = JSON.parse(readFileSync(new URL("./fixtures/wikidata-author.json", import.meta.url), "utf8"));

test("Wikidata handles become profile links, skipping ended and deprecated accounts", () => {
  assert.deepEqual(linksFromWikidata(entity), [
    { kind: "website", url: "https://www.example-author.com/", label: "example-author.com" },
    { kind: "instagram", url: "https://www.instagram.com/examplereads/", label: "@examplereads" },
    { kind: "x", url: "https://x.com/ExampleAuthor", label: "@ExampleAuthor" },
    { kind: "bluesky", url: "https://bsky.app/profile/example.bsky.social", label: "@example.bsky.social" },
  ]);
});

test("malformed Wikidata handles are dropped", () => {
  const claim = (value: string) => [{ rank: "normal", mainsnak: { snaktype: "value", datavalue: { value } } }];
  assert.deepEqual(linksFromWikidata({ claims: {
    P2002: claim("far_too_long_for_x_handles"),
    P2003: claim("has space"),
    P7085: claim("../admin"),
    P12361: claim("nodot"),
    P856: claim("javascript:alert(1)"),
  } }), []);
  assert.deepEqual(linksFromWikidata(null), []);
});

test("Open Library links: social profiles and the author's own site, nothing else", () => {
  assert.deepEqual(linksFromOpenLibrary([
    { title: "Twitter", url: "https://twitter.com/someauthor?lang=en" },
    { title: "Instagram", url: "https://www.instagram.com/someauthor/" },
    { title: "TikTok", url: "https://www.tiktok.com/@someauthor" },
    { title: "Bluesky", url: "https://bsky.app/profile/someauthor.com" },
    { title: "Sarah J. Maas website", url: "https://sarahjmaas.com/" },
    { title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Someone" },
    { title: "Fantastic Fiction Author Entry", url: "https://www.fantasticfiction.com/d/someone/" },
  ]), [
    { kind: "x", url: "https://x.com/someauthor", label: "@someauthor" },
    { kind: "instagram", url: "https://www.instagram.com/someauthor/", label: "@someauthor" },
    { kind: "tiktok", url: "https://www.tiktok.com/@someauthor", label: "@someauthor" },
    { kind: "bluesky", url: "https://bsky.app/profile/someauthor.com", label: "@someauthor.com" },
    { kind: "website", url: "https://sarahjmaas.com/", label: "sarahjmaas.com" },
  ]);
});

test("a link titled with its own domain counts as the website, upgraded to https", () => {
  assert.deepEqual(linksFromOpenLibrary([{ title: "margaretatwood.ca", url: "http://margaretatwood.ca" }]), [
    { kind: "website", url: "https://margaretatwood.ca/", label: "margaretatwood.ca" },
  ]);
});

test("posts, non-profile pages and unsafe schemes are dropped", () => {
  assert.deepEqual(linksFromOpenLibrary([
    { title: "A post", url: "https://www.instagram.com/p/Cabc123/" },
    { title: "Explore", url: "https://www.instagram.com/explore/" },
    { title: "Video", url: "https://www.tiktok.com/someauthor" },
    { title: "Feed", url: "https://bsky.app/someauthor" },
    { title: "Official website", url: "javascript:alert(1)" },
    { title: "Official website", url: "ftp://example.com" },
    { title: "Broken", url: "not a url" },
  ]), []);
});

test("merging keeps one link per kind, the first list wins, in a fixed order", () => {
  const wikidata: AuthorLink[] = [{ kind: "x", url: "https://x.com/fromwikidata", label: "@fromwikidata" }];
  const ol: AuthorLink[] = [
    { kind: "bluesky", url: "https://bsky.app/profile/a.com", label: "@a.com" },
    { kind: "x", url: "https://x.com/fromol", label: "@fromol" },
    { kind: "website", url: "https://a.com/", label: "a.com" },
  ];
  assert.deepEqual(mergeAuthorLinks(wikidata, ol).map((l) => l.url), [
    "https://a.com/",
    "https://x.com/fromwikidata",
    "https://bsky.app/profile/a.com",
  ]);
});
