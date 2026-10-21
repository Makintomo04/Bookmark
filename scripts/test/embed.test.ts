// node --import ./scripts/test/register.mjs --test scripts/test/embed.test.ts
// Optional: EMBED_SAMPLES=<dir> writes the rendered SVGs there to eyeball.
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { badgeSvg, listCardSvg, unavailableBadge } from "@/lib/embedSvg"
import { clip, esc, allowedImageUrl } from "@/lib/embedSafe"
import { badgeSnippets, listSnippets, parseBadgeOptions, DEFAULT_BADGE } from "@/lib/embedUrls"
import { getReaderTier } from "@/lib/readerTier"
import type { BadgeData, EmbedList } from "@/lib/embed"

const HOSTILE = `</text><script>alert(1)</script><a href="javascript:x">'&\u0001`

const reading = (over: Partial<BadgeData> = {}): BadgeData => ({
  username: "ada",
  accent: "#3b82f6",
  tier: getReaderTier(120),
  show: "reading",
  book: { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", coverImage: null, cardColour: "#7c3aed", progress: 42, completedAt: null, rating: null },
  ...over,
})

const list: EmbedList = {
  id: "0123456789abcdef01234567",
  title: "Books that rewired my brain",
  description: null,
  isPick: false,
  curator: "ada",
  accent: "#e11d48",
  items: Array.from({ length: 8 }, (_, i) => ({ title: `Book ${i + 1}`, author: "Someone", coverUrl: null, note: i === 0 ? "Start here." : null })),
  itemCount: 14,
}

function assertSafe(svg: string) {
  assert.ok(!/<script/i.test(svg), "no script elements")
  assert.ok(!/\son\w+=/i.test(svg), "no event handler attributes")
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(svg), "no XML-invalid control characters")
  // Only data: images, never a remote reference GitHub's camo would refuse (or that would track viewers).
  for (const m of svg.matchAll(/href="([^"]*)"/g)) assert.ok(m[1].startsWith("data:") || m[1].startsWith("url(#") || m[1] === "", `unexpected href ${m[1].slice(0, 40)}`)
  // Balanced tags (a cheap well-formedness check).
  const opens = (svg.match(/<(?!\/)(?![!?])[a-zA-Z]+(?:\s[^>]*?)?(?<!\/)>/g) ?? []).length
  const closes = (svg.match(/<\/[a-zA-Z]+>/g) ?? []).length
  assert.equal(opens, closes, "balanced tags")
}

test("esc escapes markup and strips control characters", () => {
  assert.equal(esc(`<a href="x">'&\u0001`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;")
})

test("clip cuts by code point with an ellipsis", () => {
  assert.equal(clip("abcdef", 4), "abc…")
  assert.equal(clip("📚📚📚📚📚", 3), "📚📚…")
  assert.equal(clip("  short  ", 10), "short")
})

test("badges escape hostile titles, authors and usernames in every variant", () => {
  const data = reading({ username: HOSTILE, book: { ...reading().book!, title: HOSTILE, author: HOSTILE } })
  for (const layout of ["full", "compact"] as const) {
    for (const theme of ["auto", "light", "dark"] as const) {
      const svg = badgeSvg(data, layout, theme, null)
      assertSafe(svg)
      assert.ok(svg.includes("&lt;/text&gt;"))
    }
  }
})

test("theme auto carries a dark-mode media query; fixed themes don't", () => {
  assert.match(badgeSvg(reading(), "full", "auto", null), /prefers-color-scheme:dark/)
  assert.doesNotMatch(badgeSvg(reading(), "full", "light", null), /prefers-color-scheme/)
})

test("covers are only ever embedded as data URLs", () => {
  const svg = badgeSvg(reading(), "full", "light", "data:image/jpeg;base64,AAAA")
  assert.match(svg, /href="data:image\/jpeg;base64,AAAA"/)
  assertSafe(svg)
})

test("the unavailable badge says nothing about who or why", () => {
  const svg = unavailableBadge("full", "auto")
  assertSafe(svg)
  assert.ok(!svg.includes("ada"))
  assert.match(svg, /not available/)
})

test("list cards escape and stay well formed", () => {
  const svg = listCardSvg({ ...list, title: HOSTILE, curator: HOSTILE }, "dark", [])
  assertSafe(svg)
})

test("only allowlisted https image hosts are fetched", () => {
  assert.equal(allowedImageUrl("http://utfs.io/f/x"), null)
  assert.equal(allowedImageUrl("https://169.254.169.254/latest"), null)
  assert.equal(allowedImageUrl("https://evil.example/cover.jpg"), null)
  assert.equal(allowedImageUrl("https://covers.openlibrary.org/b/id/1-L.jpg")?.toString(), "https://covers.openlibrary.org/b/id/1-M.jpg")
})

test("options parse with safe defaults, and snippets carry UTM links", () => {
  assert.deepEqual(parseBadgeOptions(new URLSearchParams("theme=<x>&layout=huge&show=all")), DEFAULT_BADGE)
  const md = badgeSnippets("https://bookmark.example", "ada", DEFAULT_BADGE).find((s) => s.key === "markdown")!
  assert.equal(md.code, "[![ada's current read on Bookmark](https://bookmark.example/embed/u/ada/badge.svg)](https://bookmark.example/u/ada?utm_source=bookmark_embed&utm_medium=badge&utm_campaign=currently_reading)")
  const iframe = listSnippets("https://bookmark.example", list.id, `"><script>`, "dark").find((s) => s.key === "iframe")!
  assert.ok(!iframe.code.includes("<script>"))
  assert.match(iframe.code, /\/embed\/lists\/0123456789abcdef01234567\?theme=dark/)
})

const samples = process.env.EMBED_SAMPLES
if (samples) {
  mkdirSync(samples, { recursive: true })
  const out = (name: string, svg: string) => writeFileSync(join(samples, name), svg)
  for (const theme of ["light", "dark"] as const) {
    out(`full-${theme}.svg`, badgeSvg(reading(), "full", theme, null))
    out(`compact-${theme}.svg`, badgeSvg(reading(), "compact", theme, null))
    out(`finished-${theme}.svg`, badgeSvg(reading({ show: "finished", tier: null, book: { ...reading().book!, progress: null, completedAt: new Date("2026-09-14"), rating: 4.5 } }), "full", theme, null))
    out(`empty-${theme}.svg`, badgeSvg(reading({ book: null }), "full", theme, null))
    out(`unavailable-${theme}.svg`, unavailableBadge("full", theme))
    out(`list-${theme}.svg`, listCardSvg(list, theme, []))
  }
}
