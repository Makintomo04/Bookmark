// Embed URLs and copy-ready snippets. Pure (no Prisma), so the EmbedDialog, the embed routes and
// the oEmbed endpoint all build exactly the same links.

export type EmbedTheme = "auto" | "light" | "dark"
export type BadgeLayout = "full" | "compact"
export type BadgeShow = "reading" | "finished"

export interface BadgeOptions {
  theme: EmbedTheme
  layout: BadgeLayout
  show: BadgeShow
}

export const DEFAULT_BADGE: BadgeOptions = { theme: "auto", layout: "full", show: "reading" }

// Unknown values fall back to the defaults, so a mistyped query string still renders a badge.
export function parseBadgeOptions(params: URLSearchParams): BadgeOptions {
  const theme = params.get("theme")
  return {
    theme: theme === "light" || theme === "dark" ? theme : "auto",
    layout: params.get("layout") === "compact" ? "compact" : "full",
    show: params.get("show") === "finished" ? "finished" : "reading",
  }
}

export function parseTheme(params: URLSearchParams): EmbedTheme {
  const theme = params.get("theme")
  return theme === "light" || theme === "dark" ? theme : "auto"
}

// Rendered size of each badge, so snippets can reserve the space and avoid layout shift.
export const BADGE_SIZE: Record<BadgeLayout, { width: number; height: number }> = {
  full: { width: 460, height: 150 },
  compact: { width: 320, height: 64 },
}
export const LIST_CARD_SIZE = { width: 460, height: 220 }
export const LIST_WIDGET_HEIGHT = 520

// Every embed links back with these, so we can see which embeds bring readers in.
export function withUtm(url: string, medium: "badge" | "list_widget" | "list_card", campaign: string) {
  const u = new URL(url)
  u.searchParams.set("utm_source", "bookmark_embed")
  u.searchParams.set("utm_medium", medium)
  u.searchParams.set("utm_campaign", campaign)
  return u.toString()
}

const enc = encodeURIComponent

function query(pairs: Record<string, string | undefined>) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(pairs)) if (v) qs.set(k, v)
  const s = qs.toString()
  return s ? `?${s}` : ""
}

export function badgeUrl(origin: string, username: string, opts: BadgeOptions, format: "svg" | "png" = "svg") {
  return `${origin}/embed/u/${enc(username)}/badge.${format}` + query({
    theme: opts.theme === DEFAULT_BADGE.theme ? undefined : opts.theme,
    layout: opts.layout === DEFAULT_BADGE.layout ? undefined : opts.layout,
    show: opts.show === DEFAULT_BADGE.show ? undefined : opts.show,
  })
}

export const profileLink = (origin: string, username: string, show: BadgeShow = "reading") =>
  withUtm(`${origin}/u/${enc(username)}`, "badge", show === "finished" ? "last_finished" : "currently_reading")

export const listWidgetUrl = (origin: string, id: string, theme: EmbedTheme) =>
  `${origin}/embed/lists/${enc(id)}` + query({ theme: theme === "auto" ? undefined : theme })

export const listCardUrl = (origin: string, id: string, theme: EmbedTheme) =>
  `${origin}/embed/lists/${enc(id)}/card.svg` + query({ theme: theme === "auto" ? undefined : theme })

export const listLink = (origin: string, id: string, medium: "list_widget" | "list_card" = "list_card") =>
  withUtm(`${origin}/lists/${enc(id)}`, medium, "list")

// Attribute values in snippets: the inputs are our own URLs and usernames, but escape anyway.
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
// Markdown alt text and BBCode can't contain their own closing brackets.
const mdText = (s: string) => s.replace(/[\[\]\\]/g, "")

export interface Snippet {
  key: string
  label: string
  hint: string
  code: string
}

export function badgeSnippets(origin: string, username: string, opts: BadgeOptions): Snippet[] {
  const img = badgeUrl(origin, username, opts)
  const link = profileLink(origin, username, opts.show)
  const alt = `${username}'s ${opts.show === "finished" ? "last finished book" : "current read"} on Bookmark`
  const { width, height } = BADGE_SIZE[opts.layout]
  return [
    { key: "markdown", label: "Markdown", hint: "GitHub READMEs, Notion, most blogs", code: `[![${mdText(alt)}](${img})](${link})` },
    { key: "html", label: "HTML", hint: "Personal sites", code: `<a href="${attr(link)}"><img src="${attr(img)}" alt="${attr(alt)}" width="${width}" height="${height}"></a>` },
    { key: "bbcode", label: "BBCode", hint: "Forum signatures", code: `[url=${link}][img]${badgeUrl(origin, username, opts, "png")}[/img][/url]` },
  ]
}

export function listSnippets(origin: string, id: string, title: string, theme: EmbedTheme): Snippet[] {
  const widget = listWidgetUrl(origin, id, theme)
  const card = listCardUrl(origin, id, theme)
  const link = listLink(origin, id)
  const alt = `${title} - a reading list on Bookmark`
  return [
    {
      key: "iframe",
      label: "HTML widget",
      hint: "Blogs and sites that allow iframes",
      code: `<iframe src="${attr(widget)}" title="${attr(alt)}" width="100%" height="${LIST_WIDGET_HEIGHT}" style="border:0;max-width:560px" loading="lazy"></iframe>`,
    },
    {
      key: "html",
      label: "HTML image",
      hint: "Where iframes aren't allowed",
      code: `<a href="${attr(link)}"><img src="${attr(card)}" alt="${attr(alt)}" width="${LIST_CARD_SIZE.width}" height="${LIST_CARD_SIZE.height}"></a>`,
    },
    { key: "markdown", label: "Markdown", hint: "GitHub READMEs, Notion", code: `[![${mdText(alt)}](${card})](${link})` },
    { key: "bbcode", label: "BBCode", hint: "Forum posts", code: `[url=${link}][img]${card.replace("/card.svg", "/card.png")}[/img][/url]` },
  ]
}
