// Preset profile banners: patterns drawn in the reader's favourite colour, so nobody needs to upload
// a photo for their profile to look finished. A chosen preset is stored in User.banner as "preset:<id>",
// next to uploaded image URLs, so everything that already passes the banner through keeps working.
// The drawing itself lives in app/components/profile/BannerPattern.tsx.

export const BANNER_PRESET_PREFIX = 'preset:'

export const BANNER_PRESETS = [
  { id: 'plain', name: 'Plain' },
  { id: 'dots', name: 'Dots' },
  { id: 'stripes', name: 'Stripes' },
  { id: 'contours', name: 'Contours' },
  { id: 'chevrons', name: 'Chevrons' },
  { id: 'halftone', name: 'Halftone' },
  { id: 'bookshelf', name: 'Bookshelf' },
  { id: 'arcs', name: 'Arcs' },
  { id: 'corners', name: 'Corners' },
  { id: 'waves', name: 'Waves' },
  { id: 'rays', name: 'Rays' },
  { id: 'blobs', name: 'Blobs' },
  { id: 'confetti', name: 'Confetti' },
  { id: 'dusk', name: 'Dusk' },
  { id: 'graph', name: 'Graph' },
] as const

export type BannerPresetId = (typeof BANNER_PRESETS)[number]['id']

const PRESET_IDS = new Set<string>(BANNER_PRESETS.map((p) => p.id))

export function isBannerPresetId(id: string): id is BannerPresetId {
  return PRESET_IDS.has(id)
}

// The stored form of a preset.
export function bannerPresetValue(id: BannerPresetId) {
  return `${BANNER_PRESET_PREFIX}${id}`
}

// The preset id a stored banner names, or null for an uploaded image, an empty value, or an id we don't know
// (one from a removed preset renders as the plain colour rather than breaking the page).
export function bannerPresetOf(banner: string | null | undefined): BannerPresetId | null {
  if (!banner || !banner.startsWith(BANNER_PRESET_PREFIX)) return null
  const id = banner.slice(BANNER_PRESET_PREFIX.length)
  return isBannerPresetId(id) ? id : 'plain'
}

export function isBannerPresetValue(banner: string | null | undefined) {
  return !!banner && banner.startsWith(BANNER_PRESET_PREFIX)
}

// True for anything the API should store: nothing, a known preset, or an uploaded image URL.
export function isStorableBanner(banner: unknown): banner is string | null | undefined {
  if (banner === null || banner === undefined || banner === '') return true
  if (typeof banner !== 'string') return false
  if (!banner.startsWith(BANNER_PRESET_PREFIX)) return true
  return isBannerPresetId(banner.slice(BANNER_PRESET_PREFIX.length))
}

// The banner a reader gets before choosing one: a pattern (never plain) picked from their id, so it stays
// the same across visits and devices and doesn't change when they rename themselves.
export function defaultBannerPreset(seed: string): BannerPresetId {
  const patterns = BANNER_PRESETS.filter((p) => p.id !== 'plain')
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return patterns[hash % patterns.length].id
}

// What to show for a stored banner: the value itself, or the seeded default when there is none.
export function resolveBanner(banner: string | null | undefined, seed: string) {
  return banner || bannerPresetValue(defaultBannerPreset(seed))
}
