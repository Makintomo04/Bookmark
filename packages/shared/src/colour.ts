import { SWATCHES } from './profile'

function parseColour(colour: string): [number, number, number] | null {
  const hex = colour.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
  }
  const rgb = colour.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
}

// Screen luminance as APCA measures it, with its soft clamp for near-black.
function apcaLuminance([r, g, b]: [number, number, number]) {
  const y = 0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.072175 * (b / 255) ** 2.4
  return y < 0.022 ? y + (0.022 - y) ** 1.414 : y
}

// APCA lightness contrast (Lc) of text on a background, as a magnitude: 60 and up reads well as body text.
function apcaContrast(text: [number, number, number], background: [number, number, number]) {
  const yt = apcaLuminance(text)
  const yb = apcaLuminance(background)
  const sapc = yb > yt ? (yb ** 0.56 - yt ** 0.57) * 1.14 : (yb ** 0.65 - yt ** 0.62) * 1.14
  return Math.abs(sapc) < 0.1 ? 0 : (Math.abs(sapc) - 0.027) * 100
}

// White or near-black, whichever reads better on the given background. Weighed with APCA rather than the
// WCAG 2 ratio, which overrates dark text on mid-tone colours: it put black on blue, green and orange
// accents, where white is plainly easier to read. Yellows and pale tints still get the dark ink.
export function readableInk(colour: string) {
  const rgb = parseColour(colour)
  if (!rgb) return '#ffffff'
  return apcaContrast([255, 255, 255], rgb) >= apcaContrast([17, 17, 17], rgb) ? '#ffffff' : '#111111'
}

// Normalises a stored colour (hex or the older rgba strings) to #rrggbb.
export function toHex(colour: string) {
  const rgb = parseColour(colour)
  if (!rgb) return null
  return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('')
}

// Mixes a colour toward black (negative amount) or white (positive), e.g. shade(c, -0.3) is 30% darker.
export function shade(colour: string, amount: number) {
  const rgb = parseColour(colour)
  if (!rgb) return colour
  const target = amount < 0 ? 0 : 255
  const t = Math.min(1, Math.abs(amount))
  return '#' + rgb.map((c) => Math.round(c + (target - c) * t).toString(16).padStart(2, '0')).join('')
}

// The profile swatches without the grey and near-black, which read as "no cover" rather than a book.
export const COVER_COLOURS = SWATCHES.filter((c) => c !== '#495057' && c !== '#1A1A1A')

// A coverless book's colour, from its title and author (FNV-1a), so it's the same on every page and reload.
export function coverColour(title: string, author?: string | null) {
  const tidy = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const key = `${tidy(title)}|${tidy(author ?? '')}`
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193)
  return COVER_COLOURS[(hash >>> 0) % COVER_COLOURS.length]
}
