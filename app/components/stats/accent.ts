import type { CSSProperties } from "react"
import { shade, toHex } from "@/lib/colour"

// The reader's favourite colour as an accent, nudged until it is legible on the page in both themes:
// 3:1 against the surface for chart marks (WCAG non-text contrast), 4.5:1 for accent text.

const BRAND = "#D92D2D"
// --background in globals.css: white, and hsl(0 0% 3.9%) in dark mode.
const LIGHT_SURFACE = "#ffffff"
const DARK_SURFACE = "#0a0a0a"

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

// Darkens (on a light surface) or lightens (on a dark one) in small steps until it reaches `ratio`.
function legibleOn(colour: string, surface: string, ratio: number) {
  const towards = luminance(surface) > 0.5 ? -1 : 1
  for (let t = 0; t <= 1; t += 0.05) {
    const candidate = shade(colour, towards * t)
    if (contrast(candidate, surface) >= ratio) return candidate
  }
  return towards < 0 ? "#000000" : "#ffffff"
}

export interface Accent {
  base: string
  light: { mark: string; text: string }
  dark: { mark: string; text: string }
}

export function readerAccent(favColour: string | null | undefined): Accent {
  const base = toHex(favColour ?? "") ?? BRAND
  return {
    base,
    light: { mark: legibleOn(base, LIGHT_SURFACE, 3), text: legibleOn(base, LIGHT_SURFACE, 4.5) },
    dark: { mark: legibleOn(base, DARK_SURFACE, 3), text: legibleOn(base, DARK_SURFACE, 4.5) },
  }
}

// Put on a wrapper with ACCENT_SCOPE: descendants then use var(--accent) for marks and
// var(--accent-text) for text, and the right one applies in each theme.
export function accentVars(accent: Accent): CSSProperties {
  return {
    "--accent-l": accent.light.mark,
    "--accent-text-l": accent.light.text,
    "--accent-d": accent.dark.mark,
    "--accent-text-d": accent.dark.text,
  } as CSSProperties
}

export const ACCENT_SCOPE =
  "[--accent:var(--accent-l)] [--accent-text:var(--accent-text-l)] dark:[--accent:var(--accent-d)] dark:[--accent-text:var(--accent-text-d)]"
