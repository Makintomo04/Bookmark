// Preset profile banners: patterns drawn in the reader's favourite colour, so nobody needs to upload
// a photo for their profile to look finished. A chosen preset is stored in User.banner as "preset:<id>",
// next to uploaded image URLs, so everything that already passes the banner through keeps working.
// The drawing itself lives in app/components/profile/BannerPattern.tsx.
export const BANNER_PRESET_PREFIX = 'preset:'

// Abstract covers in the spirit of Goodnotes' notebook covers: a few big, flat shapes in tones of the
// reader's colour, simple enough to read at thumbnail size.
export const BANNER_PRESETS = [
  { id: 'plain', name: 'Plain' },
  { id: 'arches', name: 'Arches' },
  { id: 'orbit', name: 'Orbit' },
  { id: 'waves', name: 'Waves' },
  { id: 'tiles', name: 'Tiles' },
  { id: 'bloom', name: 'Bloom' },
] as const

export type BannerPresetId = (typeof BANNER_PRESETS)[number]['id']

const PRESET_IDS = new Set<string>(BANNER_PRESETS.map((p) => p.id))

// Retired ids, mapped to the closest current preset so saved banners keep their character.
export const LEGACY: Record<string, BannerPresetId> = {
  dots: 'bloom',
  halftone: 'bloom',
  confetti: 'bloom',
  stripes: 'waves',
  contours: 'waves',
  pages: 'waves',
  margins: 'waves',
  arcs: 'arches',
  rays: 'arches',
  blobs: 'orbit',
  dusk: 'orbit',
  lamplight: 'orbit',
  graph: 'tiles',
  corners: 'tiles',
  chevrons: 'tiles',
  endpaper: 'tiles',
  bookshelf: 'tiles',
  spines: 'tiles',
}

export function isBannerPresetId(id: string): id is BannerPresetId {
  return PRESET_IDS.has(id)
}

// The stored form of a current preset.
export function bannerPresetValue(id: BannerPresetId) {
  return `${BANNER_PRESET_PREFIX}${id}`
}

// Resolve current and retired IDs; uploaded images and empty values are not presets.
export function bannerPresetOf(banner: string | null | undefined): BannerPresetId | null {
  if (!banner || !banner.startsWith(BANNER_PRESET_PREFIX)) return null
  const id = banner.slice(BANNER_PRESET_PREFIX.length)
  if (isBannerPresetId(id)) return id
  return LEGACY[id] ?? 'plain'
}

export function isBannerPresetValue(banner: string | null | undefined) {
  return !!banner && banner.startsWith(BANNER_PRESET_PREFIX)
}

// Accept legacy stored IDs during migration, while only current IDs appear in the picker.
export function isStorableBanner(banner: unknown): banner is string | null | undefined {
  if (banner === null || banner === undefined || banner === '') return true
  if (typeof banner !== 'string') return false
  if (!banner.startsWith(BANNER_PRESET_PREFIX)) return true
  const id = banner.slice(BANNER_PRESET_PREFIX.length)
  return isBannerPresetId(id) || id in LEGACY
}

// The default is stable per reader and never plain.
export function defaultBannerPreset(seed: string): BannerPresetId {
  const patterns = BANNER_PRESETS.filter((p) => p.id !== 'plain')
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return patterns[hash % patterns.length].id
}

// The banner a reader gets before choosing one.
export function resolveBanner(banner: string | null | undefined, seed: string) {
  return banner || bannerPresetValue(defaultBannerPreset(seed))
}
