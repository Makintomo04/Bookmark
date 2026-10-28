import { siteUrl } from "@/lib/siteUrl"
import type { WikidataEntity } from "@/lib/authorLinks"

// One Wikidata item (an author's, from their Open Library record), for the social handles lib/authorLinks
// reads. Wikimedia asks for a User-Agent that says who we are and where to find us. Cached for a week, like
// the Open Library record it hangs off. Null when the item is missing; throws when Wikidata is down.
export async function wikidataEntity(id: string): Promise<WikidataEntity | null> {
  const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`, {
    headers: { "User-Agent": `Bookmark author pages (${siteUrl})` },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 604800 },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Wikidata entity failed: ${res.status}`)
  const data = await res.json() as { entities?: Record<string, WikidataEntity> }
  return data.entities?.[id] ?? null
}
