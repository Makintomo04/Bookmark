// Fixed-window rate limiter kept in process memory.
//
// Limits: each server instance (and each serverless function instance on Vercel) keeps its own
// counters, and they reset on a cold start, so a determined attacker spread across instances gets
// more than `limit` tries. It's a speed bump against scripted abuse, not a hard guarantee. For that,
// swap the Map for a shared store such as Upstash Redis (@upstash/ratelimit) behind the same function.

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 10_000

function sweep(now: number) {
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) buckets.delete(key)
  })
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  if (buckets.size > MAX_BUCKETS) sweep(now)

  let bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }
  bucket.count++

  return {
    ok: bucket.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  }
}

type HeaderSource = Headers | Record<string, string | string[] | undefined> | undefined

// Best-effort client IP. On Vercel x-forwarded-for is set by the platform; elsewhere it can be spoofed.
export function clientIp(headers: HeaderSource) {
  const read = (name: string) => {
    if (!headers) return undefined
    if (headers instanceof Headers) return headers.get(name) ?? undefined
    const value = headers[name]
    return Array.isArray(value) ? value[0] : value
  }
  return read("x-forwarded-for")?.split(",")[0].trim() || read("x-real-ip") || "unknown"
}

export const tooManyRequestsMessage = "Too many attempts. Please wait a few minutes and try again."
