import { mixColour } from './colour'

// Profile banners (BOO-99). Every profile has one, so the photo always has something to overlap: a picture the
// reader uploaded, or a quiet strip of their colour mixed well into the page background.
//
// Until BOO-99 readers could pick a pattern instead, stored in User.banner as "preset:<id>". Those values
// are still in the database, and older app builds still send one at sign-up, so they stay storable, but
// nothing draws them: a preset reads as no upload and gets the strip.
export const BANNER_PRESET_PREFIX = 'preset:'

// Every id a stored preset may carry, current at the time or retired before it.
const PRESET_IDS = new Set<string>([
  'plain', 'arches', 'orbit', 'waves', 'tiles', 'bloom',
  'dots', 'halftone', 'confetti', 'stripes', 'contours', 'pages', 'margins', 'arcs', 'rays', 'blobs', 'dusk',
  'lamplight', 'graph', 'corners', 'chevrons', 'endpaper', 'bookshelf', 'spines',
])

export function isBannerPresetValue(banner: string | null | undefined) {
  return !!banner && banner.startsWith(BANNER_PRESET_PREFIX)
}

// The uploaded picture, or null for an empty banner or an old preset.
export function uploadedBanner(banner: string | null | undefined): string | null {
  return banner && !isBannerPresetValue(banner) ? banner : null
}

// Accepts uploads, empty values and any preset id ever offered.
export function isStorableBanner(banner: unknown): banner is string | null | undefined {
  if (banner === null || banner === undefined || banner === '') return true
  if (typeof banner !== 'string') return false
  if (!isBannerPresetValue(banner)) return true
  return PRESET_IDS.has(banner.slice(BANNER_PRESET_PREFIX.length))
}

// How much of the reader's colour goes into the strip: enough to say whose profile it is, little enough
// that the covers stay the brightest thing on the page.
export const BANNER_TINT = 0.2

// The strip's colour on a given page background, for places that can't use CSS color-mix (the mobile app).
export function bannerTint(colour: string, background: string) {
  return mixColour(background, colour, BANNER_TINT)
}

// The same strip in CSS, on the web's own page background.
export const bannerTintCss = (colour: string) => `color-mix(in srgb, ${colour} ${BANNER_TINT * 100}%, hsl(var(--background)))`
