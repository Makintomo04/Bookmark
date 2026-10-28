// An author's own website and social accounts, for "follow them" links on the author page. Wikidata's
// handle properties first, then Open Library's volunteer-added links for anything Wikidata lacks. Pure, with
// no network or Next imports, so the tests can load it; lib/authors.ts does the fetching.

export type AuthorLinkKind = "website" | "instagram" | "x" | "tiktok" | "bluesky"

export interface AuthorLink {
  kind: AuthorLinkKind
  url: string
  // "@handle", or the bare domain for a website.
  label: string
}

const ORDER: AuthorLinkKind[] = ["website", "instagram", "x", "tiktok", "bluesky"]

// Handles we'll turn into a profile URL. Anything else (a stray URL, spaces, a path) is dropped rather than
// linked somewhere odd.
const HANDLE: Record<Exclude<AuthorLinkKind, "website">, RegExp> = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  x: /^[A-Za-z0-9_]{1,15}$/,
  tiktok: /^[A-Za-z0-9._]{2,24}$/,
  bluesky: /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/i,
}

const PROFILE: Record<Exclude<AuthorLinkKind, "website">, (h: string) => string> = {
  instagram: (h) => `https://www.instagram.com/${h}/`,
  x: (h) => `https://x.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  bluesky: (h) => `https://bsky.app/profile/${h}`,
}

function social(kind: Exclude<AuthorLinkKind, "website">, raw: string | null | undefined): AuthorLink | null {
  // Bluesky handles are domain names, so case doesn't matter; the others keep the author's own capitals.
  const trimmed = raw?.trim().replace(/^@/, "")
  const handle = kind === "bluesky" ? trimmed?.toLowerCase() : trimmed
  if (!handle || !HANDLE[kind].test(handle)) return null
  return { kind, url: PROFILE[kind](handle), label: `@${handle}` }
}

// A website as https, with its bare domain as the label. Plain http is upgraded: nearly every author site
// serves https, and we'd rather not send readers anywhere unencrypted.
function website(raw: string | null | undefined): AuthorLink | null {
  let url: URL
  try {
    url = new URL(raw?.trim() ?? "")
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.username || url.password || !url.hostname.includes(".")) return null
  url.protocol = "https:"
  return { kind: "website", url: url.href, label: url.hostname.replace(/^www\./, "") }
}

// ---- Wikidata -----------------------------------------------------------------------------------

const WIKIDATA_PROPERTY: Record<AuthorLinkKind, string> = {
  website: "P856",
  instagram: "P2003",
  x: "P2002",
  tiktok: "P7085",
  bluesky: "P12361",
}

interface WikidataStatement {
  rank?: string
  mainsnak?: { snaktype?: string, datavalue?: { value?: unknown } }
  qualifiers?: Record<string, unknown>
}
export interface WikidataEntity {
  claims?: Record<string, WikidataStatement[] | undefined>
}

// The value worth showing for one property: never a deprecated statement or one with an end date (P582, an
// account they've left), and a preferred one over the rest.
function currentValue(statements: WikidataStatement[] | undefined): string | null {
  const live = (statements ?? []).filter((s) =>
    s.rank !== "deprecated" && !s.qualifiers?.P582 && s.mainsnak?.snaktype === "value" && typeof s.mainsnak.datavalue?.value === "string")
  const pick = live.find((s) => s.rank === "preferred") ?? live[0]
  return (pick?.mainsnak?.datavalue?.value as string | undefined) ?? null
}

export function linksFromWikidata(entity: WikidataEntity | null | undefined): AuthorLink[] {
  if (!entity?.claims) return []
  return ORDER.flatMap((kind) => {
    const value = currentValue(entity.claims?.[WIKIDATA_PROPERTY[kind]])
    const link = kind === "website" ? website(value) : social(kind, value)
    return link ? [link] : []
  })
}

// ---- Open Library -------------------------------------------------------------------------------

export interface OpenLibraryLink {
  title?: string
  url?: string
}

const HOSTS: Record<string, Exclude<AuthorLinkKind, "website">> = {
  "instagram.com": "instagram",
  "x.com": "x",
  "twitter.com": "x",
  "tiktok.com": "tiktok",
  "bsky.app": "bluesky",
}

// Paths on those sites that aren't someone's profile.
const NOT_PROFILES = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "home", "search", "hashtag", "i", "intent", "share", "tag", "discover", "video"])

function socialFromUrl(raw: string): AuthorLink | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const kind = HOSTS[url.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, "")]
  if (!kind) return null
  const parts = url.pathname.split("/").filter(Boolean)
  // bsky.app/profile/<handle>; the others are <site>/<handle>, TikTok's with an "@".
  const handle = kind === "bluesky" ? (parts[0] === "profile" ? parts[1] : undefined) : parts[0]
  if (!handle || NOT_PROFILES.has(handle.toLowerCase())) return null
  if (kind === "tiktok" && !handle.startsWith("@")) return null
  return social(kind, decodeURIComponent(handle))
}

// A volunteer link counts as the author's own site when its title says so ("Official website", "Sarah J.
// Maas website") or is just the site's own domain. Reference sites (Wikipedia, ISFDB, Fantastic Fiction)
// are titled otherwise and skipped.
function isOwnWebsite(link: OpenLibraryLink, site: AuthorLink): boolean {
  const title = link.title?.trim().toLowerCase() ?? ""
  return /\b(official\s+(web\s*)?site|website|home\s*page)\b/.test(title) || title.replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/$/, "") === site.label
}

export function linksFromOpenLibrary(links: OpenLibraryLink[] | null | undefined): AuthorLink[] {
  const found: AuthorLink[] = []
  for (const link of links ?? []) {
    if (!link.url) continue
    const profile = socialFromUrl(link.url)
    if (profile) {
      found.push(profile)
      continue
    }
    const site = website(link.url)
    if (site && isOwnWebsite(link, site)) found.push(site)
  }
  return found
}

// ---- Together -----------------------------------------------------------------------------------

// One link per kind, in a fixed order, with earlier lists winning (pass Wikidata's first).
export function mergeAuthorLinks(...lists: AuthorLink[][]): AuthorLink[] {
  const byKind = new Map<AuthorLinkKind, AuthorLink>()
  for (const link of lists.flat()) if (!byKind.has(link.kind)) byKind.set(link.kind, link)
  return ORDER.flatMap((kind) => byKind.get(kind) ?? [])
}
