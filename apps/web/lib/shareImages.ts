import { siteUrl } from "@/lib/siteUrl"

// Covers and avatars for the share images drawn with next/og (the reader card, the circle invite, Wrapped and
// Wrap cards). One list for all of them: three copies drifted apart before, and Hardcover covers fell back to
// title tiles on some images but not others.
//
// Covers and avatars are user-set strings, so they're fetched only from the hosts we serve images from (the
// same as next.config.mjs images.remotePatterns, plus OAuth avatars), over https, never from an arbitrary or
// internal address. Satori's own fetches have no timeout, so they're fetched here and passed in as data URLs.
// assets.hardcover.app: covers of books found through the Hardcover fallback (lib/hardcover.ts).
export const SHARE_IMAGE_HOSTS = ["utfs.io", "covers.openlibrary.org", "assets.hardcover.app", "images-na.ssl-images-amazon.com", "images1.penguinrandomhouse.com", "images3.penguinrandomhouse.com", "lh3.googleusercontent.com", "avatars.githubusercontent.com"]

// What Satori can decode. Not WebP or AVIF, which it refuses ("Unsupported image type"): such a cover falls
// back to its title tile.
const DRAWABLE = ["image/png", "image/jpeg", "image/gif"]

// Not the request's Host header, which the client controls.
const siteOrigin = siteUrl

// The URL to fetch, or null when it isn't one we fetch. Site-relative paths (the bundled avatars) come from this deployment.
export function shareImageUrl(url: string | null | undefined): URL | null {
  if (!url) return null
  if (url.startsWith("/") && !url.startsWith("//")) return new URL(url, siteOrigin)
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" && SHARE_IMAGE_HOSTS.includes(parsed.hostname) ? parsed : null
  } catch {
    return null
  }
}

// The image as a data URL Satori can draw, or null. `timeout` in ms: a Wrap card fetches dozens of covers at
// once and Open Library is slow to answer them all. `cacheFor` in seconds keeps the fetch in Next's data cache,
// for covers, which don't change; avatars do, so they're left out of it.
export async function shareImageData(url: string | null | undefined, timeout = 3000, cacheFor?: number): Promise<string | null> {
  const target = shareImageUrl(url)
  if (!target) return null
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(timeout), ...(cacheFor ? { next: { revalidate: cacheFor } } : {}) })
    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? ""
    if (!res.ok || !DRAWABLE.includes(type)) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    // Open Library answers a missing cover with a 1×1 GIF of a few dozen bytes: no cover, not a blank one.
    if (bytes.length < 200) return null
    return `data:${type};base64,${bytes.toString("base64")}`
  } catch {
    return null
  }
}
