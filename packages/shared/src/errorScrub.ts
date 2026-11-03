// Strips personal data from error reports before they leave the server, the browser or the phone (BOO-54).
// Sentry is set up with sendDefaultPii off; this is the second line, run in beforeSend,
// beforeSendTransaction and beforeBreadcrumb by apps/web/lib/sentry.ts and apps/mobile/src/lib/sentry.ts.
// Pure and SDK-free, so both apps share it and the tests need no Sentry.
//
// What goes:
//   - the user, down to their id (an opaque ObjectId): no email, username or IP
//   - request cookies, bodies and every header that isn't on the allow list
//   - any field named like an email, token, password, secret, cookie, review, comment, note, bio, body or
//     text, at any depth
//   - in every string: email addresses, bearer and JWT tokens, secret query parameters, and quoted values
//     after those field names (Prisma prints a failed call's arguments in its error message)

export const FILTERED = "[Filtered]"

const SENSITIVE_KEY = /^(e-?mail(address)?|.*(password|passwd|secret|token|cookie|authori[sz]ation|api[-_]?key|session)|review|reviews|comment|comments|note|notes|bio|body|text|content|excerpt|query_string)$/i

const SAFE_HEADERS = new Set(["user-agent", "content-type", "accept", "accept-language", "referer", "x-client", "x-time-zone"])

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
const SECRET_PARAM = /([?&;](?:token|code|key|secret|password|signature|sig|email|callbackUrl|state|id_token|access_token|refresh_token)=)[^&#\s"']*/gi
const QUOTED_AFTER_KEY = /\b(review|comment|note|bio|body|text|content|excerpt|email|password|token|secret)(["']?\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/gi

const MAX_DEPTH = 12

export function scrubString(value: string): string {
  return value
    .replace(QUOTED_AFTER_KEY, `$1$2"${FILTERED}"`)
    .replace(JWT, FILTERED)
    .replace(BEARER, `$1 ${FILTERED}`)
    .replace(SECRET_PARAM, `$1${FILTERED}`)
    .replace(EMAIL, FILTERED)
}

// Deep copy with sensitive fields replaced and every string scrubbed.
export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubString(value)
  if (value === null || typeof value !== "object") return value
  if (depth >= MAX_DEPTH) return FILTERED
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) && item != null ? FILTERED : scrubValue(item, depth + 1)
  }
  return out
}

type Scrubbable = {
  user?: { id?: unknown } | null
  request?: { headers?: Record<string, unknown>; cookies?: unknown; data?: unknown; [key: string]: unknown } | null
  [key: string]: unknown
}

// An error or transaction event. Returns a scrubbed copy; the input isn't changed.
export function scrubEvent<T extends object>(event: T): T {
  const { user, request, ...rest } = event as Scrubbable
  const out = scrubValue(rest) as Scrubbable
  if (user) {
    const id = typeof user.id === "string" || typeof user.id === "number" ? String(user.id) : undefined
    if (id) out.user = { id }
  }
  if (request) {
    const { headers, cookies: _cookies, data: _data, ...restRequest } = request
    const kept = headers ? Object.fromEntries(Object.entries(headers).filter(([name]) => SAFE_HEADERS.has(name.toLowerCase()))) : undefined
    out.request = { ...(scrubValue(restRequest) as object), ...(kept && { headers: scrubValue(kept) as Record<string, unknown> }) }
  }
  return out as T
}

// A breadcrumb (console line, fetch, navigation). Same rules.
export function scrubBreadcrumb<T extends object>(breadcrumb: T): T {
  return scrubValue(breadcrumb) as T
}
