// Where to send someone once they've signed in. Only paths on this site are allowed, so a crafted
// ?callbackUrl= can't bounce a reader to another domain. `origin` lets an absolute URL on this site
// through too (NextAuth hands /new-user the full URL it was given).
export function safeCallbackPath(raw: string | null | undefined, origin?: string): string | null {
  if (!raw) return null
  let value = raw
  if (origin && value.startsWith(origin)) value = value.slice(origin.length) || "/"
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null
  return value
}

// Sign-in always lands on "/", which sends readers who haven't finished onboarding to /new-user first
// and everyone else on to the callback.
export function afterSignInPath(callbackPath: string | null) {
  return callbackPath ? `/?callbackUrl=${encodeURIComponent(callbackPath)}` : "/"
}

// Carries the callback across links between the auth pages, e.g. /signin -> /register.
export function withCallback(href: string, callbackPath: string | null) {
  if (!callbackPath) return href
  return `${href}${href.includes("?") ? "&" : "?"}callbackUrl=${encodeURIComponent(callbackPath)}`
}
