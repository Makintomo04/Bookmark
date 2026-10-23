import { readableInk, shade } from "@/lib/colour"
import { BADGE_SIZE, LIST_CARD_SIZE, type BadgeLayout, type BadgeShow, type EmbedTheme } from "@/lib/embedUrls"
import { BRAND, clip, esc } from "@/lib/embedSafe"
import type { BadgeData, EmbedList } from "@/lib/embed"
import type { ReaderTier } from "@/lib/readerTier"

// The image embeds, as hand-built SVG strings. Every interpolated value is either one of ours, a colour
// that went through toHex(), a number, or passed through esc(). No scripts, no external references: the
// only images are data: URLs, which is all an SVG inside an <img> (or GitHub's camo) will draw.

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`
// The Bookmark mark, from the reader card (30 x 31).
const BOOKMARK_PATH = "M25.5097 30.5354L4.94348 30.536C2.73429 30.5361 0.943359 28.7452 0.943359 26.536L0.943358 4.61413C0.943358 2.40504 2.73414 0.614201 4.94324 0.614134L25.5092 0.613509C28.7291 0.613412 30.6295 4.22392 28.8065 6.87812L24.3892 13.3096C23.4521 14.6739 23.4521 16.4745 24.3892 17.8388L28.8068 24.2708C30.6297 26.9249 28.7296 30.5353 25.5097 30.5354Z"

const LIGHT = { bg: "#FFFFFF", ink: "#18181B", muted: "#71717A", track: "#E4E4E7", border: "#E4E4E7" }
// The reader card's palette.
const DARK = { bg: "#0B0B0C", ink: "#FAFAFA", muted: "#A1A1AA", track: "#27272A", border: "#2A2A2E" }

// The accent as text: darkened on light backgrounds when it's pale, lifted on dark ones when it's dark.
const accentOnLight = (accent: string) => (readableInk(accent) === "#111111" ? shade(accent, -0.45) : accent)
const accentOnDark = (accent: string) => (readableInk(accent) === "#ffffff" ? shade(accent, 0.45) : accent)

function palette(p: typeof LIGHT, accentText: string) {
  return `.bg{fill:${p.bg}}.bd{stroke:${p.border};fill:none}.ink{fill:${p.ink}}.mut{fill:${p.muted}}.trk{fill:${p.track}}.acc{fill:${accentText}}`
}

// "auto" follows the viewer's colour scheme, which browsers honour inside SVG images too.
function themeStyle(theme: EmbedTheme, accent: string) {
  const light = palette(LIGHT, accentOnLight(accent))
  const dark = palette(DARK, accentOnDark(accent))
  const colours = theme === "light" ? light : theme === "dark" ? dark : `${light}@media (prefers-color-scheme:dark){${dark}}`
  return `<style>text{font-family:${FONT}}${colours}</style>`
}

function svgOpen(width: number, height: number, label: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>`
}

// The frame: a metal gradient border for readers with a tier, a hairline otherwise.
function frame(width: number, height: number, tier: ReaderTier | null, radius: number) {
  const defs = tier
    ? `<linearGradient id="tier" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tier.light}"/><stop offset=".45" stop-color="${tier.colour}"/><stop offset="1" stop-color="${tier.shade}"/></linearGradient>`
    : ""
  const stroke = tier ? `stroke="url(#tier)" stroke-width="2.5"` : `class="bd" stroke-width="1"`
  return {
    defs,
    rect: `<rect x="1.25" y="1.25" width="${width - 2.5}" height="${height - 2.5}" rx="${radius}" class="bg" ${tier ? stroke : ""}/>` +
      (tier ? "" : `<rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="${radius}" ${stroke}/>`),
  }
}

function mark(x: number, y: number, size: number) {
  return `<path transform="translate(${x} ${y}) scale(${size / 31})" d="${BOOKMARK_PATH}" fill="${BRAND}"/>`
}

// A cover, or the book's colour with its initial when there's no drawable image.
function cover(id: string, x: number, y: number, w: number, h: number, dataUrl: string | null, colour: string, title: string) {
  const clipDef = `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/></clipPath>`
  const body = dataUrl
    ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${colour}"/><image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" href="${esc(dataUrl)}" xlink:href="${esc(dataUrl)}"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${colour}"/><text x="${x + w / 2}" y="${y + h / 2 + w * 0.14}" text-anchor="middle" font-size="${Math.round(w * 0.42)}" font-weight="700" fill="${readableInk(colour)}">${esc(Array.from(title.trim())[0]?.toUpperCase() ?? "")}</text>`
  return { def: clipDef, el: `<g clip-path="url(#${id})">${body}</g>` }
}

const stars = (rating: number) => "★".repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? "½" : "")

const finishedOn = (d: Date | null) =>
  d ? `Finished ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` : "Finished"

const label = (show: BadgeShow) => (show === "finished" ? "Last finished" : "Currently reading")

export function badgeSvg(data: BadgeData, layout: BadgeLayout, theme: EmbedTheme, coverData: string | null) {
  const { width, height } = BADGE_SIZE[layout]
  const { book, tier, accent, username } = data
  const colour = book?.cardColour && /^#[0-9a-f]{6}$/i.test(book.cardColour) ? book.cardColour : accent
  const aria = book
    ? `${username} on Bookmark. ${label(data.show)}: ${book.title} by ${book.author}${book.progress !== null ? `, ${book.progress}%` : ""}`
    : `${username} on Bookmark`
  const f = frame(width, height, tier, layout === "full" ? 14 : 10)
  const parts: string[] = []
  const defs: string[] = [f.defs]

  if (layout === "full") {
    const textX = book ? 112 : 24
    const textW = width - textX - 20
    defs.push(`<clipPath id="txt"><rect x="${textX}" y="0" width="${textW}" height="${height}"/></clipPath>`)
    if (book) {
      const c = cover("cv", 22, 20, 72, 108, coverData, colour, book.title)
      defs.push(c.def)
      parts.push(c.el)
    }
    const lines: string[] = [
      `<text x="${textX}" y="34" font-size="10.5" font-weight="700" letter-spacing="1.2" class="acc">${label(data.show).toUpperCase()}</text>`,
    ]
    if (book) {
      lines.push(
        `<text x="${textX}" y="58" font-size="16" font-weight="700" class="ink">${esc(clip(book.title, 34))}</text>`,
        `<text x="${textX}" y="77" font-size="13" class="mut">${esc(clip(book.author, 44))}</text>`,
      )
      if (book.progress !== null) {
        const barW = textW - 44
        lines.push(
          `<rect x="${textX}" y="91" width="${barW}" height="6" rx="3" class="trk"/>`,
          book.progress > 0 ? `<rect x="${textX}" y="91" width="${Math.max(6, (barW * book.progress) / 100)}" height="6" rx="3" fill="${accent}"/>` : "",
          `<text x="${textX + textW}" y="97.5" font-size="12" font-weight="700" text-anchor="end" class="ink">${book.progress}%</text>`,
        )
      } else if (data.show === "finished") {
        lines.push(`<text x="${textX}" y="99" font-size="12" class="mut">${esc(finishedOn(book.completedAt))}${book.rating ? `<tspan class="acc" dx="8">${stars(book.rating)}</tspan>` : ""}</text>`)
      }
    } else {
      lines.push(`<text x="${textX}" y="62" font-size="16" font-weight="700" class="ink">${data.show === "finished" ? "Nothing finished yet" : "Between books"}</text>`)
    }
    parts.push(`<g clip-path="url(#txt)">${lines.join("")}</g>`)

    // The attribution line: whose badge, on Bookmark, and their tier.
    const footY = 132
    const name = esc(clip(username, 22))
    parts.push(
      mark(textX, footY - 11, 12),
      `<text x="${textX + 18}" y="${footY}" font-size="12"><tspan font-weight="700" class="ink">${name}</tspan><tspan class="mut"> on Bookmark</tspan></text>`,
    )
    if (tier) {
      const pill = `${tier.label} reader`
      const pw = pill.length * 6.4 + 16
      parts.push(
        `<rect x="${width - 20 - pw}" y="${footY - 13}" width="${pw}" height="18" rx="9" fill="url(#tier)"/>`,
        `<text x="${width - 20 - pw / 2}" y="${footY}" font-size="10.5" font-weight="700" text-anchor="middle" fill="#111111">${pill}</text>`,
      )
    }
  } else {
    const textX = book ? 54 : 16
    const textW = width - textX - 14
    defs.push(`<clipPath id="txt"><rect x="${textX}" y="0" width="${textW}" height="${height}"/></clipPath>`)
    if (book) {
      const c = cover("cv", 12, 8, 32, 48, coverData, colour, book.title)
      defs.push(c.def)
      parts.push(c.el)
    }
    const lines: string[] = [
      `<text x="${textX}" y="21" font-size="9.5" font-weight="700" letter-spacing="1" class="acc">${label(data.show).toUpperCase()}</text>`,
      mark(width - 26, 11, 11),
    ]
    if (book) {
      lines.push(`<text x="${textX}" y="38" font-size="13" font-weight="700" class="ink">${esc(clip(book.title, 32))}</text>`)
      if (book.progress !== null) {
        const barW = textW - 40
        lines.push(
          `<rect x="${textX}" y="47" width="${barW}" height="4" rx="2" class="trk"/>`,
          book.progress > 0 ? `<rect x="${textX}" y="47" width="${Math.max(4, (barW * book.progress) / 100)}" height="4" rx="2" fill="${accent}"/>` : "",
          `<text x="${textX + textW}" y="52" font-size="11" font-weight="700" text-anchor="end" class="ink">${book.progress}%</text>`,
        )
      } else {
        lines.push(`<text x="${textX}" y="53" font-size="11" class="mut">${esc(clip(book.author, 40))}</text>`)
      }
    } else {
      lines.push(`<text x="${textX}" y="42" font-size="13" font-weight="700" class="ink">${esc(clip(username, 18))}<tspan font-weight="400" class="mut"> · ${data.show === "finished" ? "nothing finished yet" : "between books"}</tspan></text>`)
    }
    parts.push(`<g clip-path="url(#txt)">${lines.join("")}</g>`)
  }

  return `${svgOpen(width, height, aria)}${themeStyle(theme, accent)}<defs>${defs.join("")}</defs>${f.rect}` +
    `<rect x="0" y="${layout === "full" ? 22 : 14}" width="4" height="${height - (layout === "full" ? 44 : 28)}" rx="2" fill="${accent}"/>` +
    `${parts.join("")}</svg>`
}

// The same badge for a private, blocked-off or missing profile or list: nothing in it depends on which.
export function unavailableSvg(width: number, height: number, theme: EmbedTheme) {
  const f = frame(width, height, null, height > 80 ? 14 : 10)
  const cy = height / 2
  return `${svgOpen(width, height, "Not available on Bookmark")}${themeStyle(theme, BRAND)}${f.rect}` +
    `${mark(20, cy - 9, 18)}<text x="46" y="${cy + 5}" font-size="13"><tspan font-weight="700" class="ink">Bookmark</tspan><tspan class="mut"> · not available</tspan></text></svg>`
}

export const unavailableBadge = (layout: BadgeLayout, theme: EmbedTheme) =>
  unavailableSvg(BADGE_SIZE[layout].width, BADGE_SIZE[layout].height, theme)

// The image fallback for a list (where iframes aren't allowed): the first few covers and the title.
export function listCardSvg(list: EmbedList, theme: EmbedTheme, covers: (string | null)[]) {
  const { width, height } = LIST_CARD_SIZE
  const f = frame(width, height, null, 14)
  const defs: string[] = [`<clipPath id="txt"><rect x="20" y="0" width="${width - 40}" height="${height}"/></clipPath>`]
  const parts: string[] = []
  const curator = list.curator ? `Curated by ${list.curator}` : "Curated by the Bookmark team"
  parts.push(
    `<g clip-path="url(#txt)">`,
    `<text x="22" y="34" font-size="10.5" font-weight="700" letter-spacing="1.2" class="acc">READING LIST · ${list.itemCount} ${list.itemCount === 1 ? "BOOK" : "BOOKS"}</text>`,
    `<text x="22" y="57" font-size="17" font-weight="700" class="ink">${esc(clip(list.title, 42))}</text>`,
    `</g>`,
  )
  const shown = list.items.slice(0, 6)
  shown.forEach((item, i) => {
    const c = cover(`c${i}`, 22 + i * 70, 72, 60, 90, covers[i] ?? null, shade(list.accent, -0.15 - (i % 3) * 0.12), item.title)
    defs.push(c.def)
    parts.push(c.el)
  })
  if (shown.length === 0) parts.push(`<text x="22" y="120" font-size="13" class="mut">No books on this list yet.</text>`)
  if (list.itemCount > shown.length && shown.length === 6) {
    // The sixth slot becomes "+N" when there are more.
    parts.push(`<rect x="372" y="72" width="60" height="90" rx="3" class="trk"/><text x="402" y="122" font-size="14" font-weight="700" text-anchor="middle" class="ink">+${list.itemCount - 5}</text>`)
  }
  parts.push(
    mark(22, 185, 12),
    `<text x="40" y="196" font-size="12"><tspan class="mut">${esc(clip(curator, 40))}</tspan><tspan class="mut"> on </tspan><tspan font-weight="700" class="ink">Bookmark</tspan></text>`,
  )
  const aria = `${list.title}: a reading list on Bookmark. ${curator}.`
  return `${svgOpen(width, height, aria)}${themeStyle(theme, list.accent)}<defs>${defs.join("")}</defs>${f.rect}${parts.join("")}</svg>`
}
