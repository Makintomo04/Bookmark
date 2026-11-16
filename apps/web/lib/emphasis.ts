// Book descriptions are user-edited Markdown, and cleanDescription (lib/openLibrary.ts) keeps their italics:
// titles like *Jonathan Strange & Mr. Norrell*. These turn the markers into emphasis for display, or drop
// them where only plain text will do (a page's meta description), so no reader sees the asterisks (BOO-92).
const EMPHASIS = /\*(?=\S)([^*\n]+?)(?<=\S)\*|(?<![\p{L}\p{N}])_(?=\S)([^_\n]+?)(?<=\S)_(?![\p{L}\p{N}])/gu

export type EmphasisPart = { text: string, em: boolean }

export function emphasisParts(text: string): EmphasisPart[] {
  const parts: EmphasisPart[] = []
  let last = 0
  for (const m of text.matchAll(EMPHASIS)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index), em: false })
    parts.push({ text: m[1] ?? m[2], em: true })
    last = m.index! + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), em: false })
  return parts
}

export const withoutEmphasis = (text: string) => text.replace(EMPHASIS, (_, a, b) => a ?? b)
