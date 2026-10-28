// Shared by the Edit Profile form, onboarding and /api/user so the limits can't drift apart.
export const USERNAME_MIN = 2
export const USERNAME_MAX = 30
export const BIO_MAX = 300

export const DEFAULT_COLOUR = '#D92D2D'
export const SWATCHES = ['#D92D2D', '#E8590C', '#E0A800', '#2F9E44', '#0C8599', '#1971C2', '#5F3DC4', '#C2255C', '#495057', '#1A1A1A']

// A starting username for onboarding, from the provider's display name or the email's local part,
// e.g. "Jane Doe" -> "janedoe", "jane.reader@x.com" -> "jane.reader". The reader can change it.
export function suggestUsername(user: { name?: string | null; email?: string | null }) {
  const source = user.name || user.email?.split('@')[0] || ''
  const cleaned = source.toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[._-]+|[._-]+$/g, '').slice(0, USERNAME_MAX)
  return usernameProblem(cleaned) ? '' : cleaned
}

// Usernames are the /u/ address and how friends find each other, so they're kept plain: lowercase letters,
// digits, dots, dashes and underscores, starting and ending with a letter or digit. Stored lowercase, so
// "Alice" and "alice" can't both exist and look-alike characters can't pass for someone else.
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
// Names that would read as Bookmark itself speaking.
const RESERVED_USERNAMES = new Set(['admin', 'administrator', 'bookmark', 'bookmarkapp', 'help', 'moderator', 'mod', 'official', 'root', 'staff', 'support', 'system', 'team'])
// Words no username may contain anywhere, so "bookmark_support" or "staff.jane" can't pass for the team
// next to the real staff badge (staffBadge.ts). Short words like "mod" and "team" are only refused whole,
// above, or they'd catch "modern" and "steam".
const RESERVED_WORDS = ['bookmark', 'admin', 'staff', 'support', 'moderator', 'official', 'librarian']

export function normaliseUsername(input: string) {
  return input.trim().toLowerCase()
}

// Why a (normalised) username can't be used, or null when it can.
export function usernameProblem(username: string): string | null {
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) return `Usernames are ${USERNAME_MIN}–${USERNAME_MAX} characters.`
  if (!USERNAME_PATTERN.test(username)) return 'Use lowercase letters, numbers, dots, dashes or underscores, starting and ending with a letter or number.'
  if (RESERVED_USERNAMES.has(username)) return 'That username is reserved. Try another.'
  // Separators are ignored, so "book.mark" and "ad_min" are caught too.
  const joined = username.replace(/[._-]/g, '')
  const word = RESERVED_WORDS.find((w) => joined.includes(w))
  if (word) return `Usernames can't include "${word}", so nobody can pass for the Bookmark team. Try another.`
  return null
}

// A colour as the pickers produce it: #rgb or #rrggbb. Anything else is refused, since colours are written
// into inline styles on public pages.
export function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
}

// Where profile pictures and covers may come from: uploads, catalogue covers, and the avatars Google and
// GitHub sign-ins bring. Matches images.remotePatterns in next.config.mjs. assets.hardcover.app is for books
// found through the Hardcover search fallback (apps/web/lib/hardcover.ts).
export const IMAGE_HOSTS = ['utfs.io', 'covers.openlibrary.org', 'assets.hardcover.app', 'images-na.ssl-images-amazon.com', 'images1.penguinrandomhouse.com', 'images3.penguinrandomhouse.com', 'lh3.googleusercontent.com', 'avatars.githubusercontent.com']

export function isAllowedImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && IMAGE_HOSTS.includes(url.hostname)
  } catch {
    return false
  }
}

// A display name is what heads a profile, a feed row or a search result when the reader sets one, with
// @username beneath; the username stays the address. Free-form (any script, spaces, capitals), trimmed,
// with no hidden characters, and never passing for the Bookmark team any more than a username may.
export const DISPLAY_NAME_MAX = 40

// Trimmed, with runs of whitespace collapsed. Empty means "no display name": the username shows instead.
export function normaliseDisplayName(input: string) {
  return input.replace(/\s+/g, ' ').trim()
}

// Control characters, zero-width and bidi characters: invisible on the page, so a name could look like
// someone else's or hide something in it.
// eslint-disable-next-line no-control-regex
const HIDDEN_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/

// Why a (normalised) display name can't be used, or null when it can. Empty is fine: it's optional.
export function displayNameProblem(name: string): string | null {
  if (!name) return null
  if (name.length > DISPLAY_NAME_MAX) return `Display names are up to ${DISPLAY_NAME_MAX} characters.`
  if (HIDDEN_CHARACTERS.test(name)) return "Display names can't include hidden characters."
  // Spaces, punctuation and case are ignored, so "Book Mark Support" and "the-Admin" are caught too.
  const joined = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (RESERVED_USERNAMES.has(joined)) return 'That display name is reserved. Try another.'
  const word = RESERVED_WORDS.find((w) => joined.includes(w))
  if (word) return `Display names can't include "${word}", so nobody can pass for the Bookmark team. Try another.`
  return null
}

// What to call a reader: their display name when they've set one, else their username. Pass-through for
// records from before display names existed.
export function readerName(reader: { displayName?: string | null; username?: string | null }) {
  return reader.displayName || reader.username || ''
}
