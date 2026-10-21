function parseColour(colour: string): [number, number, number] | null {
  const hex = colour.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
  }
  const rgb = colour.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
}

// White or near-black, whichever contrasts more with the given background.
export function readableInk(colour: string) {
  const rgb = parseColour(colour)
  if (!rgb) return '#ffffff'
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? '#ffffff' : '#111111'
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
