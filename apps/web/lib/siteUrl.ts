// The site's public origin, for metadata, the sitemap and share images (server-side only).
// NEXT_PUBLIC_SITE_URL wins when set. On Vercel without it, production uses the project's production
// domain and previews their own deployment URL, so links never point at localhost.
function resolveSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return `http://localhost:${process.env.PORT || 3000}`
}

export const siteUrl = resolveSiteUrl().replace(/\/$/, "")

// Where links in emails (verify, reset password) should land. A preview links to itself: NEXTAUTH_URL
// is shared across Vercel environments and points at production, which may not have the page yet.
function resolveAppUrl() {
  if (process.env.VERCEL_ENV === "preview") {
    const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
    if (host) return `https://${host}`
  }
  return process.env.NEXTAUTH_URL || siteUrl
}

export const appUrl = resolveAppUrl().replace(/\/$/, "")
