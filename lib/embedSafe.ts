// The pure parts of the embeds: escaping, clipping and the image host allowlist. No Prisma or React,
// so the SVG renderers (and their tests under plain Node) can load it.

export const BRAND = "#F13C3C"

// Covers are user-set URLs, so only fetch from the hosts we serve images from, never an arbitrary or
// internal address. Image badges inline them as data URLs: an SVG inside an <img> (and GitHub's camo
// proxy) won't load anything external, and it saves a second hop through camo.
const IMAGE_HOSTS = ["utfs.io", "covers.openlibrary.org", "images-na.ssl-images-amazon.com", "images1.penguinrandomhouse.com", "images3.penguinrandomhouse.com", "books.google.com", "books.googleusercontent.com"]

export function allowedImageUrl(url: string | null | undefined) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" || !IMAGE_HOSTS.includes(parsed.hostname)) return null
    // Open Library's large covers run to hundreds of KB; the medium size is plenty for a badge.
    if (parsed.hostname === "covers.openlibrary.org") parsed.pathname = parsed.pathname.replace(/-L\.jpg$/, "-M.jpg")
    return parsed
  } catch {
    return null
  }
}

// Characters XML 1.0 forbids outright (most control characters, U+FFFE and U+FFFF).
const XML_INVALID = new RegExp("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\uFFFE\\uFFFF]", "g")

// XML/HTML text and attribute escaping. Also drops characters invalid in XML, which would break the whole SVG.
export function esc(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(XML_INVALID, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Cuts by characters (by code point, so emoji aren't split). SVG text can't wrap or measure itself.
export function clip(value: string, max: number) {
  const chars = Array.from(value.trim().replace(/\s+/g, " "))
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : chars.join("")
}
