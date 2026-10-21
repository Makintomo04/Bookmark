// Shared by the Edit Profile form, onboarding and /api/user so the limits can't drift apart.
export const USERNAME_MIN = 2
export const USERNAME_MAX = 50
export const BIO_MAX = 300

export const DEFAULT_COLOUR = '#D92D2D'
export const SWATCHES = ['#D92D2D', '#E8590C', '#E0A800', '#2F9E44', '#0C8599', '#1971C2', '#5F3DC4', '#C2255C', '#495057', '#1A1A1A']

// A starting username for onboarding, from the provider's display name or the email's local part,
// e.g. "Jane Doe" -> "janedoe", "jane.reader@x.com" -> "jane.reader". The reader can change it.
export function suggestUsername(user: { name?: string | null; email?: string | null }) {
  const source = user.name || user.email?.split('@')[0] || ''
  const cleaned = source.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30)
  return cleaned.length >= USERNAME_MIN ? cleaned : ''
}
